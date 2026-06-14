import { minimaxAvatarProvider } from "./providers/minimax";
import { zhiyingAvatarProvider } from "./providers/zhiying";
import { adapterAvatarProvider } from "./providers/adapter";
import type { AvatarProvider, AvatarProviderId } from "./types";

const providers: Record<AvatarProviderId, AvatarProvider> = {
  adapter_v1: adapterAvatarProvider,
  minimax_avatar: minimaxAvatarProvider,
  tencent_zhiying: zhiyingAvatarProvider,
};

export function getAvatarProvider(providerId?: string): AvatarProvider {
  if (
    providerId === "minimax_avatar" ||
    providerId === "tencent_zhiying" ||
    providerId === "adapter_v1"
  ) {
    return providers[providerId];
  }

  const configuredProvider = process.env.AVATAR_PROVIDER;

  if (
    configuredProvider === "minimax_avatar" ||
    configuredProvider === "tencent_zhiying" ||
    configuredProvider === "adapter_v1"
  ) {
    return providers[configuredProvider];
  }

  return providers.adapter_v1;
}

export type {
  AvatarJobInput,
  AvatarProviderId,
  AvatarProviderJob,
} from "./types";
