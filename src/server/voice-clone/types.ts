export type VoiceCloneProviderId =
  | "manual_v1"
  | "cosyvoice"
  | "gpt_sovits"
  | "qwen_audio_tts_flash";

export type VoiceCloneJobInput = {
  jobId: string;
  memoryId: string;
  voiceSampleUrl: string;
  name?: string | null;
  relationship?: string | null;
  speechStyle?: string | null;
  voicePrefix?: string;
};

export type VoiceCloneProviderJob = {
  provider: VoiceCloneProviderId;
  providerJobId: string | null;
  status: "pending" | "processing" | "completed";
  progress: number;
  voiceId?: string;
  requestId?: string;
  providerRequest: Record<string, unknown>;
  providerResponse: Record<string, unknown>;
};

export type VoiceCloneProvider = {
  id: VoiceCloneProviderId;
  displayName: string;
  createJob(input: VoiceCloneJobInput): Promise<VoiceCloneProviderJob>;
};
