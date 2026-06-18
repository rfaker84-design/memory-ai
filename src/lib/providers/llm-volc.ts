// llm-volc.ts — Volcengine (火山引擎) LLM streaming client
// Falls back to DeepSeek/OpenAI when Volc keys not configured
import OpenAI from "openai";

export interface LLMStreamChunk {
  text: string;
  emotion: string;
}

export interface LLMConfig {
  name: string;
  relationship: string | null;
  lifeStory: string | null;
}

function getVolcClient(): OpenAI | null {
  const apiKey = process.env.VOLC_API_KEY;
  if (!apiKey) return null;
  return new OpenAI({
    apiKey,
    baseURL: process.env.VOLC_BASE_URL || "https://ark.cn-beijing.volces.com/api/v3",
  });
}

function getFallbackClient(): OpenAI {
  const apiKey = process.env.DEEPSEEK_API_KEY || process.env.OPENAI_API_KEY || "";
  const baseURL = process.env.DEEPSEEK_API_KEY
    ? "https://api.deepseek.com/v1"
    : process.env.OPENAI_BASE_URL || "https://api.openai.com/v1";
  return new OpenAI({ apiKey, baseURL });
}

function buildSystemPrompt(config: LLMConfig): string {
  const rel = config.relationship || "重要的人";
  const story = config.lifeStory?.slice(0, 500) || "（记录不多）";
  return [
    "你是忆见AI，你正在代表\"" + config.name + "\"与用户对话。",
    config.name + "是用户的" + rel + "。",
    "关于" + config.name + "的生平：" + story,
    "",
    "对话规则：",
    "1. 只能基于生平信息回答，不要编造",
    "2. 保持温柔、克制的语气",
    "3. 回复简短（1-3句话）",
    "4. 使用第一人称视角",
    "5. 不要过度煽情",
  ].join("\n");
}

export function detectEmotion(text: string): string {
  const t = text;
  if (t.includes("笑") || t.includes("开心") || t.includes("温暖")) return "warm";
  if (t.includes("难过") || t.includes("想念") || t.includes("离开")) return "sad";
  if (t.includes("记得") || t.includes("那时候") || t.includes("曾经")) return "nostalgic";
  if (t.includes("嗯") || t.includes("想想")) return "thinking";
  return "calm";
}

// ─── Streaming LLM call ─────────────────────────────────────
export async function* streamLLM(
  config: LLMConfig,
  userMessage: string,
  history: Array<{ role: "user" | "assistant"; content: string }>,
): AsyncGenerator<LLMStreamChunk> {
  const systemPrompt = buildSystemPrompt(config);
  const client = getVolcClient() || getFallbackClient();
  const model = process.env.VOLC_MODEL || process.env.AI_MODEL || "deepseek-chat";

  const stream = await client.chat.completions.create({
    model,
    messages: [
      { role: "system", content: systemPrompt },
      ...history.map(h => ({ role: h.role as "user" | "assistant", content: h.content })),
      { role: "user", content: userMessage },
    ],
    temperature: 0.7,
    max_tokens: 200,
    stream: true,
  });

  let fullText = "";
  let emotionSent = false;

  for await (const chunk of stream) {
    const delta = chunk.choices?.[0]?.delta?.content || "";
    if (!delta) continue;
    fullText += delta;

    const emotion = emotionSent ? "" : detectEmotion(fullText);
    if (!emotionSent && emotion) emotionSent = true;

    yield { text: delta, emotion };
  }
}
