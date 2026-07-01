import { AIProviderType } from "../ai/provider-types";
import type { AIProvider } from "../ai/ai-provider";
import type { AvatarProvider } from "./avatar-provider";

export class AvatarAIProviderAdapter implements AIProvider {
  readonly providerType = AIProviderType.AVATAR;

  constructor(
    readonly providerName: string,
    readonly avatarProvider: AvatarProvider
  ) {}
}
