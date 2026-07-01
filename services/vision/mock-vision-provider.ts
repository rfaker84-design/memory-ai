import type { VisionProvider } from "./vision-provider";
import type { VisionAnalyzeInput, VisionAnalyzeResult } from "./types";

export class MockVisionProvider implements VisionProvider {
  async analyzeImage(_input: VisionAnalyzeInput): Promise<VisionAnalyzeResult> {
    return {
      description: "",
      provider: "mock",
      labels: [],
    };
  }
}
