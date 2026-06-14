import type {
  AvatarJobInput,
  AvatarProvider,
  AvatarProviderJob,
} from "../types";

const zhiyingSecretId = process.env.TENCENT_SECRET_ID;
const zhiyingSecretKey = process.env.TENCENT_SECRET_KEY;
const appBaseUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

export const zhiyingAvatarProvider: AvatarProvider = {
  id: "tencent_zhiying",
  displayName: "Tencent Zhiying",
  async createJob(input: AvatarJobInput): Promise<AvatarProviderJob> {
    if (!zhiyingSecretId || !zhiyingSecretKey) {
      return {
        provider: "tencent_zhiying",
        providerJobId: null,
        status: "pending",
        progress: 0,
        providerRequest: {
          memory_id: input.memoryId,
          input_url: input.photoUrl,
        },
        providerResponse: {
          message: "TENCENT_SECRET_ID 或 TENCENT_SECRET_KEY 未配置，任务已保留在 pending 状态。",
        },
      };
    }

    const callbackUrl = appBaseUrl + "/api/avatar-callback";

    // Tencent Cloud Zhiying API
    // Reference: https://cloud.tencent.com/document/product/1248
    // Note: Requires signature v3 authentication
    const response = await fetch("https://ivld.tencentcloudapi.com", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-TC-Action": "CreateVideoTask",
        "X-TC-Version": "2021-09-03",
      },
      body: JSON.stringify({
        ImageUrl: input.photoUrl,
        CallbackUrl: callbackUrl,
        JobId: input.jobId,
      }),
    });

    const data = (await response.json()) as {
      Response?: {
        TaskId?: string;
        Error?: { Code?: string; Message?: string };
        RequestId?: string;
      };
    };

    if (data.Response?.Error) {
      throw new Error(data.Response.Error.Message || "Zhiying 创建任务失败");
    }

    return {
      provider: "tencent_zhiying",
      providerJobId: data.Response?.TaskId || input.jobId,
      status: "processing",
      progress: 10,
      providerRequest: {
        api: "https://ivld.tencentcloudapi.com",
        memory_id: input.memoryId,
        input_url: input.photoUrl,
        callback_url: callbackUrl,
      },
      providerResponse: data,
    };
  },
};
