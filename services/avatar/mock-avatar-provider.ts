import type { AvatarProvider } from "./avatar-provider";
import type { AvatarGenerateInput, AvatarGenerateResult } from "./types";

export class MockAvatarProvider implements AvatarProvider {
  async generateAvatar(
    _input: AvatarGenerateInput
  ): Promise<AvatarGenerateResult> {
    return {
      avatarUrl: "",
      provider: "mock",
      status: "mock",
    };
  }
}
