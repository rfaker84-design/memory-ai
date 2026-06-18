// API: Real-time streaming chat with integrated TTS
// SSE stream: { text, audioChunk, emotion, totalAudioChunks }
import { NextRequest } from "next/server";
import OpenAI from "openai";

function getClient(): OpenAI {
  const apiKey = process.env.DEEPSEEK_API_KEY || process.env.OPENAI_API_KEY || "";
  const baseURL = process.env.DEEPSEEK_API_KEY
    ? "https://api.deepseek.com/v1"
    : process.env.OPENAI_BASE_URL || "https://api.openai.com/v1";
  return new OpenAI({ apiKey, baseURL });
}

function detectEmotion(text: string): string {
  const t = text.toLowerCase();
  if (t.includes("笑") || t.includes("开心") || t.includes("温暖")) return "warm";
  if (t.includes("难过") || t.includes("想念") || t.includes("离开")) return "sad";
  if (t.includes("记得") || t.includes("那时候") || t.includes("曾经")) return "nostalgic";
  if (t.includes("嗯") || t.includes("想想")) return "thinking";
  return "calm";
}

async function ttsChunk(text: string): Promise<string | null> {
  if (!text.trim() || text.length < 2) return null;
  try {
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
    const resp = await fetch(baseUrl + "/api/tts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    });
    if (resp.ok) {
      const data = await resp.json();
      return data.audioBase64 || null;
    }
  } catch { /* ignore */ }
  return null;
}

export async function POST(req: NextRequest) {
  try {
    const { name, relationship, lifeStory, userMessage } = await req.json();
    if (!name || !userMessage) {
      return new Response(JSON.stringify({ error: "missing fields" }), { status: 400 });
    }

    const rel = relationship || "重要的人";
    const story = lifeStory?.slice(0, 500) || "（记录不多）";

    const systemPrompt = [
      "你是忆见AI，你正在代表\"" + name + "\"与用户对话。",
      name + "是用户的" + rel + "。",
      "关于" + name + "的生平：" + story,
      "",
      "对话规则：",
      "1. 只能基于生平信息回答，不要编造",
      "2. 保持温柔、克制的语气",
      "3. 回复简短（1-3句话）",
      "4. 使用第一人称视角",
      "5. 不要过度煽情",
    ].join("\n");

    const client = getClient();
    const stream = await client.chat.completions.create({
      model: process.env.AI_MODEL || "deepseek-chat",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userMessage },
      ],
      temperature: 0.7,
      max_tokens: 200,
      stream: true,
    });

    const encoder = new TextEncoder();
    let fullText = "";
    let emotionSent = false;
    let chunkIndex = 0;
    let sentenceBuffer = "";

    const readable = new ReadableStream({
      async start(controller) {
        try {
          for await (const chunk of stream) {
            const delta = chunk.choices?.[0]?.delta?.content || "";
            if (!delta) continue;

            fullText += delta;
            sentenceBuffer += delta;

            const textPayload = JSON.stringify({ text: delta });
            controller.enqueue(encoder.encode("data: " + textPayload + "\n\n"));

            if (!emotionSent) {
              emotionSent = true;
              const emo = detectEmotion(fullText);
              controller.enqueue(encoder.encode("data: " + JSON.stringify({ emotion: emo }) + "\n\n"));
            }

            const breakChars = ["。", "！", "？", ".", "!", "?", "\n", "，", ","];
            if (breakChars.some(c => delta.includes(c)) && sentenceBuffer.trim().length > 4) {
              const audioBase64 = await ttsChunk(sentenceBuffer.trim());
              if (audioBase64) {
                controller.enqueue(encoder.encode("data: " + JSON.stringify({ audioChunk: audioBase64 }) + "\n\n"));
                chunkIndex++;
              }
              sentenceBuffer = "";
            }
          }

          if (sentenceBuffer.trim().length > 1) {
            const audioBase64 = await ttsChunk(sentenceBuffer.trim());
            if (audioBase64) {
              controller.enqueue(encoder.encode("data: " + JSON.stringify({ audioChunk: audioBase64 }) + "\n\n"));
              chunkIndex++;
            }
          }

          controller.enqueue(encoder.encode("data: " + JSON.stringify({ totalAudioChunks: chunkIndex }) + "\n\n"));
          controller.enqueue(encoder.encode("data: [DONE]\n\n"));
        } catch (e: unknown) {
          const msg = e instanceof Error ? e.message : "stream error";
          controller.enqueue(encoder.encode("data: " + JSON.stringify({ error: msg }) + "\n\n"));
        } finally {
          controller.close();
        }
      },
    });

    return new Response(readable, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        "Connection": "keep-alive",
        "X-Accel-Buffering": "no",
      },
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "chat failed";
    return new Response(JSON.stringify({ error: msg }), { status: 500 });
  }
}