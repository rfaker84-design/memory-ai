export type AvatarProviderId =
  | "adapter_v1"
  | "minimax_avatar"
  | "tencent_zhiying";

export type AvatarJobInput = {
  jobId: string;
  memoryId: string;
  photoUrl: string;
  name?: string | null;
  voiceModelUrl?: string | null;
};

export type AvatarProviderJob = {
  provider: AvatarProviderId;
  providerJobId: string | null;
  status: "pending" | "processing";
  progress: number;
  providerRequest: Record<string, unknown>;
  providerResponse: Record<string, unknown>;
};

export type AvatarProvider = {
  id: AvatarProviderId;
  displayName: string;
  createJob(input: AvatarJobInput): Promise<AvatarProviderJob>;
};
