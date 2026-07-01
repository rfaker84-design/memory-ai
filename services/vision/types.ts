export interface VisionAnalyzeInput {
  imageUrl: string;
  prompt?: string;
  maxLabels?: number;
}

export interface VisionAnalyzeResult {
  description: string;
  provider: string;
  labels: string[];
}
