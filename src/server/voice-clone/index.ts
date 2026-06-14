import { cosyVoiceProvider } from "./providers/cosyvoice";
import { gptSovitsProvider } from "./providers/gptSovits";
import { manualVoiceCloneProvider } from "./providers/manual";
import type { VoiceCloneProvider, VoiceCloneProviderId } from "./types";

const providers: Record<VoiceCloneProviderId, VoiceCloneProvider> = {
  manual_v1: manualVoiceCloneProvider,
  cosyvoice: cosyVoiceProvider,
  gpt_sovits: gptSovitsProvider,
};

export function getVoiceCloneProvider(providerId?: string) {
  if (
    providerId === "cosyvoice" ||
    providerId === "gpt_sovits" ||
    providerId === "manual_v1"
  ) {
    return providers[providerId];
  }

  const configuredProvider = process.env.VOICE_CLONE_PROVIDER;

  if (
    configuredProvider === "cosyvoice" ||
    configuredProvider === "gpt_sovits" ||
    configuredProvider === "manual_v1"
  ) {
    return providers[configuredProvider];
  }

  return providers.manual_v1;
}

export type {
  VoiceCloneJobInput,
  VoiceCloneProviderId,
  VoiceCloneProviderJob,
} from "./types";
