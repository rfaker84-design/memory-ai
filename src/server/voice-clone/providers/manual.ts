import type {
  VoiceCloneJobInput,
  VoiceCloneProvider,
  VoiceCloneProviderJob,
} from "../types";

export const manualVoiceCloneProvider: VoiceCloneProvider = {
  id: "manual_v1",
  displayName: "Manual Voice Clone Adapter",
  async createJob(input: VoiceCloneJobInput): Promise<VoiceCloneProviderJob> {
    return {
      provider: "manual_v1",
      providerJobId: `manual-${input.jobId}`,
      status: "processing",
      progress: 10,
      providerRequest: {
        memory_id: input.memoryId,
        input_url: input.voiceSampleUrl,
        name: input.name || "",
        relationship: input.relationship || "",
        speech_style: input.speechStyle || "",
      },
      providerResponse: {
        message:
          "声音克隆任务已进入本地适配层。后续可替换为 CosyVoice 或 GPT-SoVITS worker。",
      },
    };
  },
};
