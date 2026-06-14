import { asr } from "tencentcloud-sdk-nodejs-asr";

const AsrClient = asr.v20190614.Client;

const client = new AsrClient({
  credential: {
    secretId: process.env.TENCENT_SECRET_ID!,
    secretKey: process.env.TENCENT_SECRET_KEY!,
  },
  region: "ap-guangzhou",
  profile: {
    httpProfile: {
      endpoint: "asr.tencentcloudapi.com",
    },
  },
});

type SttRequest = {
  audioBase64?: string;
  audioFormat?: string;
};

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as SttRequest;
    const { audioBase64, audioFormat } = body;

    if (!audioBase64) {
      return Response.json({ error: "缺少音频数据" }, { status: 400 });
    }

    // Remove data URL prefix if present
    const base64Data = audioBase64.replace(/^data:audio\/\w+;base64,/, "");

    const result = await client.SentenceRecognition({
      ProjectId: 0,
      SubServiceType: 2,
      EngSerViceType: "16k_zh",
      SourceType: 1,
      VoiceFormat: audioFormat || "wav",
      Data: base64Data,
      DataLen: base64Data.length,
    });

    return Response.json({
      text: result.Result || "",
      requestId: result.RequestId,
    });
  } catch (error: unknown) {
    console.error("STT error:", error);
    const message = error instanceof Error ? error.message : "语音识别失败";
    return Response.json({ error: message }, { status: 500 });
  }
}
