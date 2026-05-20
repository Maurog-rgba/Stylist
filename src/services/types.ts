export interface InferenceResult {
  score: number;
  analysis: string;
  tags: string[];
  inferenceTimeMs: number;
}

export interface ImageInput {
  path?: string;
  buffer?: number[];
}
