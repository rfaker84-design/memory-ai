import { AIProviderType } from "../ai/provider-types";
import type { AIProvider } from "../ai/ai-provider";
import type { OCRProvider } from "./ocr-provider";

export class OCRAIProviderAdapter implements AIProvider {
  readonly providerType = AIProviderType.OCR;

  constructor(
    readonly providerName: string,
    readonly ocrProvider: OCRProvider
  ) {}
}
