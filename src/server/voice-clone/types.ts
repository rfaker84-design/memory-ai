export type VoiceCloneProviderId =
  | "manual_v1"
  | "cosyvoice"
  | "gpt_sovits";

export type VoiceCloneJobInput = {
  jobId: string;
  memoryId: string;
  voiceSampleUrl: string;
  name?: string | null;
  relationship?: string | null;
  speechStyle?: string | null;
};

export type VoiceCloneProviderJob = {
  provider: VoiceCloneProviderId;
  providerJobId: string | null;
  status: "pending" | "processing";
  progress: number;
  providerRequest: Record<string, unknown>;
  providerResponse: Record<string, unknown>;
};

export type VoiceCloneProvider = {
  id: VoiceCloneProviderId;
  displayName: string;
  createJob(input: VoiceCloneJobInput): Promise<VoiceCloneProviderJob>;
};
