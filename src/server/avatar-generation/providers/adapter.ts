import type {
  AvatarJobInput,
  AvatarProvider,
  AvatarProviderJob,
} from "../types";

export const adapterAvatarProvider: AvatarProvider = {
  id: "adapter_v1",
  displayName: "Adapter V1 (Mock)",
  async createJob(input: AvatarJobInput): Promise<AvatarProviderJob> {
    return {
      provider: "adapter_v1",
      providerJobId: "adapter-" + input.jobId,
      status: "processing",
      progress: 20,
      providerRequest: {
        memory_id: input.memoryId,
        input_url: input.photoUrl,
        name: input.name || "",
      },
      providerResponse: {
        message: "数字人生成任务已进入本地适配层。后续可替换为 MiniMax Avatar 或腾讯智影。",
      },
    };
  },
};
