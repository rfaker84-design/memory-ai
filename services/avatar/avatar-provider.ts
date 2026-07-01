import type { AvatarGenerateInput, AvatarGenerateResult } from "./types";

export interface AvatarProvider {
  generateAvatar(
    input: AvatarGenerateInput
  ): Promise<AvatarGenerateResult>;
}
