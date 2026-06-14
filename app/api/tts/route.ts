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

export async function POST(request: Request) {
  try {
    const { text } = await request.json();

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
  } catch (error: any) {
    console.error(error);

    return Response.json(
      {
        error: error.message || "TTS失败",
      },
      {
        status: 500,
      }
    );
  }
}