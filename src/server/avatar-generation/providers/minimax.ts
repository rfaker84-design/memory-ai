import type {
  AvatarJobInput,
  AvatarProvider,
  AvatarProviderJob,
} from "../types";

const minimaxApiKey = process.env.MINIMAX_API_KEY;
const minimaxGroupId = process.env.MINIMAX_GROUP_ID;
const appBaseUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

export const minimaxAvatarProvider: AvatarProvider = {
  id: "minimax_avatar",
  displayName: "MiniMax Avatar",
  async createJob(input: AvatarJobInput): Promise<AvatarProviderJob> {
    if (!minimaxApiKey || !minimaxGroupId) {
      return {
        provider: "minimax_avatar",
        providerJobId: null,
        status: "pending",
        progress: 0,
        providerRequest: {
          memory_id: input.memoryId,
          input_url: input.photoUrl,
        },
        providerResponse: {
          message: "MINIMAX_API_KEY 或 MINIMAX_GROUP_ID 未配置，任务已保留在 pending 状态。",
        },
      };
    }

    const callbackUrl = appBaseUrl + "/api/avatar-callback";

    // MiniMax Avatar API: create a talking avatar video
    // Reference: https://platform.minimaxi.com/document/Talking%20Avatar%20Video
    const response = await fetch("https://api.minimaxi.com/v1/talking_avatar_video", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer " + minimaxApiKey,
      },
      body: JSON.stringify({
        model: "speech-2.6-turbo",
        group_id: minimaxGroupId,
        audio_setting: {
          sample_rate: 32000,
        },
        avatar_setting: {
          avatar_type: "human",
          image_url: input.photoUrl,
        },
        voice_setting: {
          voice_id: input.voiceModelUrl ? "clone" : "default",
        },
        callback_url: callbackUrl,
        job_id: input.jobId,
      }),
    });

    const data = (await response.json()) as {
      base_resp?: { status_code?: number; status_msg?: string };
      task_id?: string;
    };

    if (!response.ok || data.base_resp?.status_code !== 0) {
      const errMsg = data.base_resp?.status_msg || "MiniMax Avatar 创建任务失败";
      throw new Error(errMsg);
    }

    return {
      provider: "minimax_avatar",
      providerJobId: data.task_id || input.jobId,
      status: "processing",
      progress: 10,
      providerRequest: {
        api: "https://api.minimaxi.com/v1/talking_avatar_video",
        memory_id: input.memoryId,
        input_url: input.photoUrl,
        callback_url: callbackUrl,
      },
      providerResponse: data,
    };
  },
};
