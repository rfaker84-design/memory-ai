import type { OCRInput, OCRResult } from "./types";

export interface OCRProvider {
  recognizeText(input: OCRInput): Promise<OCRResult>;
}
