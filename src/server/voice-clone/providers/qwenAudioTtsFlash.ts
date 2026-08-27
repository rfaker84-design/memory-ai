import type {
  VoiceCloneJobInput,
  VoiceCloneProvider,
  VoiceCloneProviderJob,
} from "../types";

export const QWEN_AUDIO_TTS_FLASH_MODEL = "qwen-audio-3.0-tts-flash";
const CUSTOMIZATION_PATH = "/api/v1/services/audio/tts/customization";

type QwenResponse = {
  output?: { voice_id?: unknown };
  request_id?: unknown;
  message?: unknown;
  code?: unknown;
};

function configuredEndpoint(environment: NodeJS.ProcessEnv = process.env): string {
  const raw = environment.DASHSCOPE_VOICE_CLONE_ENDPOINT?.trim();
  if (!raw) throw new Error("QWEN_VOICE_CLONE_NOT_CONFIGURED");

  let endpoint: URL;
  try {
    endpoint = new URL(raw);
  } catch {
    throw new Error("QWEN_VOICE_CLONE_NOT_CONFIGURED");
  }
  const allowedHost = endpoint.hostname === "dashscope.aliyuncs.com"
    || endpoint.hostname.endsWith(".maas.aliyuncs.com");
  if (endpoint.protocol !== "https:" || !allowedHost || endpoint.pathname !== CUSTOMIZATION_PATH) {
    throw new Error("QWEN_VOICE_CLONE_NOT_CONFIGURED");
  }
  return endpoint.toString();
}

function configuredApiKey(environment: NodeJS.ProcessEnv = process.env): string {
  const key = environment.DASHSCOPE_API_KEY?.trim();
  if (!key) throw new Error("QWEN_VOICE_CLONE_NOT_CONFIGURED");
  return key;
}

function voicePrefix(input: VoiceCloneJobInput): string {
  const prefix = input.voicePrefix?.trim();
  if (!prefix || !/^[A-Za-z0-9]{1,10}$/.test(prefix)) {
    throw new Error("QWEN_VOICE_CLONE_INVALID_PREFIX");
  }
  return prefix;
}

export const qwenAudioTtsFlashProvider: VoiceCloneProvider = {
  id: "qwen_audio_tts_flash",
  displayName: "Qwen-Audio-3.0-TTS-Flash",
  async createJob(input: VoiceCloneJobInput): Promise<VoiceCloneProviderJob> {
    const response = await fetch(configuredEndpoint(), {
      method: "POST",
      headers: {
        Authorization: `Bearer ${configuredApiKey()}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "voice-enrollment",
        input: {
          action: "create_voice",
          target_model: QWEN_AUDIO_TTS_FLASH_MODEL,
          prefix: voicePrefix(input),
          url: input.voiceSampleUrl,
        },
      }),
    });
    const data = await response.json().catch(() => ({})) as QwenResponse;
    const voiceId = typeof data.output?.voice_id === "string" ? data.output.voice_id : null;
    const requestId = typeof data.request_id === "string" ? data.request_id : undefined;

    if (!response.ok || !voiceId) {
      throw new Error("QWEN_VOICE_CLONE_PROVIDER_FAILED");
    }

    return {
      provider: "qwen_audio_tts_flash",
      providerJobId: voiceId,
      status: "completed",
      progress: 100,
      voiceId,
      requestId,
      providerRequest: {
        model: QWEN_AUDIO_TTS_FLASH_MODEL,
        prefix: voicePrefix(input),
      },
      providerResponse: requestId ? { requestId, voiceId } : { voiceId },
    };
  },
};
