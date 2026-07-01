import type { AIProviderType } from "./provider-types";

export interface AIProvider {
  providerName: string;
  providerType: AIProviderType;
}
