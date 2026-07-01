import { AIProviderType } from "../ai/provider-types";
import type { AIProvider } from "../ai/ai-provider";
import type { VisionProvider } from "./vision-provider";

export class VisionAIProviderAdapter implements AIProvider {
  readonly providerType = AIProviderType.VISION;

  constructor(
    readonly providerName: string,
    readonly visionProvider: VisionProvider
  ) {}
}
