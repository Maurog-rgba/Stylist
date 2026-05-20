import { NativeModules, Platform } from 'react-native';
import type { InferenceResult, ImageInput } from './types';

const StylistInference = NativeModules.StylistInference;

const INFERENCE_PROMPT = `You are a fashion analysis AI. Analyze this outfit in detail.

Provide your response as a JSON object with exactly these fields:
{
  "score": <number 0-100 rating the overall look>,
  "analysis": "<detailed description and style analysis>",
  "tags": ["<tag1>", "<tag2>", ...]
}

Only output the JSON, no other text.`;

const INFERENCE_TIMEOUT_MS = 30000;

const MODEL_FILENAME = 'ggml-model-q4_k.gguf';
const MMPROJ_FILENAME = 'mmproj-model-f16.gguf';

export class ModelService {
  private static instance: ModelService;
  private modelPath: string | null = null;
  private mmprojPath: string | null = null;
  private initialized = false;

  static getInstance(): ModelService {
    if (!ModelService.instance) {
      ModelService.instance = new ModelService();
    }
    return ModelService.instance;
  }

  private constructor() {}

  async ensureModelAssets(): Promise<void> {
    if (Platform.OS !== 'android') {
      throw new Error('ModelService is only supported on Android');
    }
    if (!StylistInference) {
      throw new Error('Native module StylistInference is not available');
    }

    try {
      const copiedPaths: Record<string, string> = await StylistInference.copyModelAssets();

      if (copiedPaths[MODEL_FILENAME]) {
        this.modelPath = copiedPaths[MODEL_FILENAME];
      }
      if (copiedPaths[MMPROJ_FILENAME]) {
        this.mmprojPath = copiedPaths[MMPROJ_FILENAME];
      }
    } catch {
      // assets copy failed, try filesDir directly
    }

    const modelsDir: string = await StylistInference.getModelsDirectory();

    if (!this.modelPath) {
      this.modelPath = `${modelsDir}/${MODEL_FILENAME}`;
    }
    if (!this.mmprojPath) {
      this.mmprojPath = `${modelsDir}/${MMPROJ_FILENAME}`;
    }

    this.initialized = true;
  }

  async loadModel(): Promise<void> {
    if (Platform.OS !== 'android') {
      throw new Error('ModelService is only supported on Android');
    }
    if (!StylistInference) {
      throw new Error('Native module StylistInference is not available');
    }
    if (!this.initialized) {
      await this.ensureModelAssets();
    }
    if (!this.modelPath || !this.mmprojPath) {
      throw new Error('Model paths not resolved. Push models via adb to device.');
    }

    await StylistInference.loadModel(this.modelPath, this.mmprojPath);
  }

  async infer(imageInput: ImageInput): Promise<InferenceResult> {
    if (!StylistInference) {
      throw new Error('Native module StylistInference is not available');
    }

    const startTime = Date.now();

    let rawResult: string;
    if (imageInput.path) {
      // Path from react-native-vision-camera usually starts with file://, 
      // llama.cpp needs absolute path without prefix
      const absolutePath = imageInput.path.replace('file://', '');
      rawResult = await Promise.race([
        StylistInference.inferFromFile(absolutePath, INFERENCE_PROMPT),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('Inference timeout')), INFERENCE_TIMEOUT_MS),
        ),
      ]);
    } else if (imageInput.buffer) {
      rawResult = await Promise.race([
        StylistInference.infer(imageInput, INFERENCE_PROMPT),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('Inference timeout')), INFERENCE_TIMEOUT_MS),
        ),
      ]);
    } else {
      throw new Error('imageInput must contain path or buffer');
    }

    const inferenceTimeMs = Date.now() - startTime;

    return this.parseResult(rawResult, inferenceTimeMs);
  }

  async unloadModel(): Promise<void> {
    if (!StylistInference) {
      return;
    }
    await StylistInference.unloadModel();
  }

  async isModelLoaded(): Promise<boolean> {
    if (!StylistInference) {
      return false;
    }
    return StylistInference.isModelLoaded();
  }

  private parseResult(raw: string, inferenceTimeMs: number): InferenceResult {
    const trimmed = raw.trim();

    const jsonMatch = trimmed.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      try {
        const parsed = JSON.parse(jsonMatch[0]) as InferenceResult;
        return {
          ...parsed,
          inferenceTimeMs,
        };
      } catch {
        // fall through to fallback
      }
    }

    return {
      score: 50,
      analysis: trimmed || 'No analysis generated',
      tags: [],
      inferenceTimeMs,
    };
  }
}
