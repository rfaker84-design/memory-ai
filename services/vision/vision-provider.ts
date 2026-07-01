import type { VisionAnalyzeInput, VisionAnalyzeResult } from "./types";

export interface VisionProvider {
  analyzeImage(input: VisionAnalyzeInput): Promise<VisionAnalyzeResult>;
}
