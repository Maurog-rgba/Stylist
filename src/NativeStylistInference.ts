import type { TurboModule } from 'react-native';
import { TurboModuleRegistry } from 'react-native';

export interface InferenceResult {
  score: number;
  analysis: string;
  tags: string[];
  inferenceTimeMs: number;
}

export interface Spec extends TurboModule {
  loadModel(path: string): Promise<void>;
  infer(imageBuffer: Object, prompt: string): Promise<Object>;
  inferFromFile(imagePath: string, prompt: string): Promise<string>;
  unloadModel(): Promise<void>;
}

export default TurboModuleRegistry.getEnforcing<Spec>('StylistInference');
