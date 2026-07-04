import { tts } from "tencentcloud-sdk-nodejs-tts";

import type { TTSProvider } from "./tts-provider";
import type { TTSGenerateInput, TTSGenerateResult } from "./types";

const TtsClient = tts.v20190823.Client;

type TencentTextToVoiceResult = {
  Audio?: string;
};

export class TencentTTSProvider implements TTSProvider {
  private client: InstanceType<typeof TtsClient>;

  constructor() {
    this.client = new TtsClient({
      credential: {
        secretId: process.env.TENCENT_SECRET_ID || "",
        secretKey: process.env.TENCENT_SECRET_KEY || "",
      },
      region: process.env.TENCENT_TTS_REGION || "ap-guangzhou",
      profile: {
        httpProfile: {
          endpoint: "tts.tencentcloudapi.com",
        },
      },
    });
  }

  async generateSpeech(input: TTSGenerateInput): Promise<TTSGenerateResult> {
    try {
      const format = input.format === "wav" ? "wav" : "mp3";
      const result = (await this.client.TextToVoice({
        Text: input.text,
        SessionId: Date.now().toString(),
        ModelType: 1,
        VoiceType: input.voice ? Number(input.voice) : 101001,
        Codec: format,
        Speed: input.speed,
      })) as TencentTextToVoiceResult;

      const audioBase64 = result.Audio ?? "";
      const audioUrl = audioBase64
        ? `data:audio/${format};base64,${audioBase64}`
        : "";

      return {
        audioBase64,
        audioUrl,
        provider: "tencent",
        format,
      };
    } catch (error) {
      throw new Error(
        error instanceof Error ? error.message : "Tencent TTS request failed"
      );
    }
  }
}
