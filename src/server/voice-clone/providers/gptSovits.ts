import type {
  VoiceCloneJobInput,
  VoiceCloneProvider,
  VoiceCloneProviderJob,
} from "../types";

const gptSovitsEndpoint = process.env.GPT_SOVITS_WORKER_URL;
const appBaseUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

export const gptSovitsProvider: VoiceCloneProvider = {
  id: "gpt_sovits",
  displayName: "GPT-SoVITS",
  async createJob(input: VoiceCloneJobInput): Promise<VoiceCloneProviderJob> {
    if (!gptSovitsEndpoint) {
      return {
        provider: "gpt_sovits",
        providerJobId: null,
        status: "pending",
        progress: 0,
        providerRequest: {
          memory_id: input.memoryId,
          input_url: input.voiceSampleUrl,
        },
        providerResponse: {
          message: "GPT_SOVITS_WORKER_URL ?????????? pending ???",
        },
      };
    }

    const callbackUrl = appBaseUrl + "/api/voice-clone-callback";

    const response = await fetch(gptSovitsEndpoint + "/jobs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        job_id: input.jobId,
        memory_id: input.memoryId,
        voice_sample_url: input.voiceSampleUrl,
        name: input.name,
        relationship: input.relationship,
        speech_style: input.speechStyle,
        callback_url: callbackUrl,
      }),
    });

    const data = (await response.json()) as {
      provider_job_id?: string;
      status?: string;
      progress?: number;
      error?: string;
    };

    if (!response.ok) {
      throw new Error(data.error || "GPT-SoVITS worker ??????");
    }

    return {
      provider: "gpt_sovits",
      providerJobId: data.provider_job_id || input.jobId,
      status: (data.status as "pending" | "processing") || "processing",
      progress: data.progress ?? 10,
      providerRequest: {
        endpoint: gptSovitsEndpoint,
        memory_id: input.memoryId,
        input_url: input.voiceSampleUrl,
        callback_url: callbackUrl,
      },
      providerResponse: data,
    };
  },
};