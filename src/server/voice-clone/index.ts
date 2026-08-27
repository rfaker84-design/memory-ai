import { cosyVoiceProvider } from "./providers/cosyvoice";
import { gptSovitsProvider } from "./providers/gptSovits";
import { manualVoiceCloneProvider } from "./providers/manual";
import { qwenAudioTtsFlashProvider } from "./providers/qwenAudioTtsFlash";
import type { VoiceCloneProvider, VoiceCloneProviderId } from "./types";

const providers: Record<VoiceCloneProviderId, VoiceCloneProvider> = {
  manual_v1: manualVoiceCloneProvider,
  cosyvoice: cosyVoiceProvider,
  gpt_sovits: gptSovitsProvider,
  qwen_audio_tts_flash: qwenAudioTtsFlashProvider,
};

export function getVoiceCloneProvider(providerId?: string) {
  if (
    providerId === "cosyvoice" ||
    providerId === "gpt_sovits" ||
    providerId === "qwen_audio_tts_flash" ||
    providerId === "manual_v1"
  ) {
    return providers[providerId];
  }

  const configuredProvider = process.env.VOICE_CLONE_PROVIDER;

  if (
    configuredProvider === "cosyvoice" ||
    configuredProvider === "gpt_sovits" ||
    configuredProvider === "qwen_audio_tts_flash" ||
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
