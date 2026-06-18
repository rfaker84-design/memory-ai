// volc.ts — 火山引擎豆包大模型客户端 (生产版)
// Model: doubao-seed-1.8
// 返回: text + emotion (warm/calm/sad/nostalgic)

import OpenAI from "openai";

// ─── Types ──────────────────────────────────────────────────
export type Emotion = "warm" | "calm" | "sad" | "nostalgic";

export interface VolcResponse {
  text: string;
  emotion: Emotion;
}

export interface MemoryContext {
  name: string;
  relationship: string | null;
  lifeStory: string | null;
}

// ─── Volc client ────────────────────────────────────────────
function createVolcClient(): OpenAI {
  const apiKey = process.env.VOLC_API_KEY;
  if (!apiKey) throw new Error("VOLC_API_KEY 未配置");
  return new OpenAI({
    apiKey,
    baseURL: process.env.VOLC_BASE_URL || "https://ark.cn-beijing.volces.com/api/v3",
  });
}

// ─── System prompt ──────────────────────────────────────────
function buildSystemPrompt(ctx: MemoryContext): string {
  const rel = ctx.relationship || "重要的人";
  const story = ctx.lifeStory?.slice(0, 500) || "记录不多，但每一个细节都很珍贵。";
  return `你是忆见AI，一个温柔克制的记忆陪伴助手。
你正在代表「${ctx.name}」与用户对话。
${ctx.name}是用户的${rel}。

关于${ctx.name}的生平：
${story}

对话规则：
1. 只能基于生平信息回答，不编造
2. 始终保持温柔、克制的语气，像在轻声说话
3. 每次回复1-3句话，不超过80字
4. 使用第一人称视角
5. 如果用户问出记忆范围的事，温和地说记不清了
6. 不煽情、不说「虽然…但是…」
7. 让用户感觉到：这个人还在，只是换了一种方式存在`;
}

// ─── 情绪检测 (本地，不上AI) ────────────────────────────────
export function detectEmotion(text: string): Emotion {
  if (/想|怀念|记得|那时候|曾经|以前|过去|回忆/.test(text)) return "nostalgic";
  if (/难过|伤心|哭|泪|离开|再也|失去/.test(text)) return "sad";
  if (/笑|开心|幸福|温暖|美好|喜欢|爱/.test(text)) return "warm";
  return "calm";
}

// ─── 调用火山豆包 ───────────────────────────────────────────
export async function callVolcLLM(
  ctx: MemoryContext,
  userMessage: string,
  history: Array<{ role: "user" | "assistant"; content: string }> = [],
): Promise<VolcResponse> {
  const systemPrompt = buildSystemPrompt(ctx);

  try {
    const client = createVolcClient();
    const resp = await client.chat.completions.create({
      model: "doubao-seed-1.8",
      messages: [
        { role: "system", content: systemPrompt },
        ...history.map(h => ({
          role: h.role as "user" | "assistant",
          content: h.content,
        })),
        { role: "user", content: userMessage },
      ],
      temperature: 0.7,
      max_tokens: 200,
    });

    const text = resp.choices?.[0]?.message?.content?.trim() || "我在这里。";
    const emotion = detectEmotion(text);

    return { text, emotion };
  } catch (err) {
    // 火山不可用时明确报错，不使用mock
    const msg = err instanceof Error ? err.message : "unknown";
    console.error("[volc] LLM 调用失败:", msg);
    throw new Error("火山豆包调用失败: " + msg);
  }
}

// ─── 流式调用 ───────────────────────────────────────────────
export async function* streamVolcLLM(
  ctx: MemoryContext,
  userMessage: string,
  history: Array<{ role: "user" | "assistant"; content: string }> = [],
): AsyncGenerator<{ text: string; emotion?: Emotion }> {
  const systemPrompt = buildSystemPrompt(ctx);
  const client = createVolcClient();

  const stream = await client.chat.completions.create({
    model: "doubao-seed-1.8",
    messages: [
      { role: "system", content: systemPrompt },
      ...history.map(h => ({
        role: h.role as "user" | "assistant",
        content: h.content,
      })),
      { role: "user", content: userMessage },
    ],
    temperature: 0.7,
    max_tokens: 200,
    stream: true,
  });

  let fullText = "";
  let emotionSent = false;

  for await (const chunk of stream) {
    const delta = chunk.choices?.[0]?.delta?.content;
    if (!delta) continue;
    fullText += delta;

    if (!emotionSent && fullText.length > 6) {
      emotionSent = true;
      yield { text: delta, emotion: detectEmotion(fullText) };
    } else {
      yield { text: delta };
    }
  }
}
