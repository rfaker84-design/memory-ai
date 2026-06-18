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

    const audioBase64 = result.Audio;
    const audioUrl = audioBase64 ? "data:audio/mp3;base64," + audioBase64 : null;
    return Response.json({
      audioBase64,
      audio_url: audioUrl,
    });
  } catch (error: unknown) {
    console.error(error);
    const message = error instanceof Error ? error.message : "TTS failed";
    // Mock fallback: return empty audio
    return Response.json(
      { error: message, audio_url: null, audioBase64: null },
      { status: 200 }
    );
  }
}
