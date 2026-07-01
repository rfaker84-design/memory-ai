import type { OCRProvider } from "./ocr-provider";
import type { OCRInput, OCRResult } from "./types";

export class MockOCRProvider implements OCRProvider {
  async recognizeText(_input: OCRInput): Promise<OCRResult> {
    return {
      text: "",
      provider: "mock",
    };
  }
}
