import { tts } from "tencentcloud-sdk-nodejs-tts";

const TtsClient = tts.v20190823.Client;

const client = new TtsClient({
  credential: {
    secretId: process.env.TENCENT_SECRET_ID!,
    secretKey: process.env.TENCENT_SECRET_KEY!,
  },
  region: process.env.TENCENT_TTS_REGION || "ap-guangzhou",
  profile: {
    httpProfile: {
      endpoint: "tts.tencentcloudapi.com",
    },
  },
});

type TtsRequest = {
  text?: string;
};

export async function POST(request: Request) {
  try {
    const { text } = (await request.json()) as TtsRequest;

    if (!text?.trim()) {
      return Response.json({ error: "请输入要转换的文字" }, { status: 400 });
    }

    const result = await client.TextToVoice({
      Text: text,
      SessionId: Date.now().toString(),
      ModelType: 1,
      VoiceType: 101001,
      Codec: "mp3",
    });

    return Response.json({
      audioBase64: result.Audio,
    });
  } catch (error: unknown) {
    console.error(error);
    const message = error instanceof Error ? error.message : "TTS失败";

    return Response.json(
      {
        error: message,
      },
      {
        status: 500,
      }
    );
  }
}
