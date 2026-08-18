// MVP: OpenAI helper — emotion text generation + memory chat
import OpenAI from "openai";

function getClient(): OpenAI {
  const apiKey = process.env.DEEPSEEK_API_KEY || process.env.OPENAI_API_KEY || "";
  const baseURL = process.env.DEEPSEEK_API_KEY
    ? "https://api.deepseek.com/v1"
    : process.env.OPENAI_BASE_URL || "https://api.openai.com/v1";
  return new OpenAI({ apiKey, baseURL });
}

// ─── Generate emotion presence text for Memory Room ──────────
export async function generateMemoryEmotionText(params: {
  name: string;
  relationship: string | null;
  lifeStory: string | null;
}): Promise<string> {
  const { name, relationship, lifeStory } = params;
  const rel = relationship || "重要的人";

  const prompt = `你是一个克制、事实导向的叙述者。请根据以下记忆生成一句话。

名字：${name}
关系：${rel}
生平片段：${lifeStory?.slice(0, 200) || "（无详细记录）"}

要求：
- 一句话，不超过30字
- 克制、清晰、不煽情
- 像"轻声说话"
- 不要使用"虽然...但是..."句式
- 不要说你很遗憾、很难过
- 不要声称人物仍在现实中表达、等待或陪伴用户

请只输出这一句话，不要任何其他内容。`;

  try {
    const client = getClient();
    const resp = await client.chat.completions.create({
      model: process.env.AI_MODEL || "deepseek-chat",
      messages: [{ role: "user", content: prompt }],
      temperature: 0.7,
      max_tokens: 80,
    });
    return resp.choices[0]?.message?.content?.trim() || "暂时无法生成内容，请稍后重试。";
  } catch {
    return "暂时无法生成内容，请稍后重试。";
  }
}

// ─── Chat with memory ───────────────────────────────────────
export async function chatWithMemory(params: {
  name: string;
  relationship: string | null;
  lifeStory: string | null;
  history: Array<{ role: "user" | "assistant"; content: string }>;
  userMessage: string;
}): Promise<string> {
  const { name, relationship, lifeStory, history, userMessage } = params;
  const rel = relationship || "重要的人";

  const systemPrompt = `你是"忆见AI"，一个记忆陪伴助手。

你是“忆见 AI”，根据用户确认的关于“${name}”的信息整理回应。${name}是用户的${rel}。

关于${name}的生平：${lifeStory?.slice(0, 500) || "（记录不多）"}

对话规则：
1. 只能基于生平信息回答，不要编造
2. 保持克制、清晰的语气
3. 回复简短（2-4句话）
4. 不模仿人物第一人称，不声称人物正在说话、倾听、等待或现实存在
5. 如果用户问超出记忆范围的事，明确说明“没有足够的已确认信息”
6. 不要过度煽情
7. 使用 AI 助手的第三方、事实型视角`;

  try {
    const client = getClient();
    const resp = await client.chat.completions.create({
      model: process.env.AI_MODEL || "deepseek-chat",
      messages: [
        { role: "system", content: systemPrompt },
        ...history.map(h => ({ role: h.role as "user" | "assistant", content: h.content })),
        { role: "user", content: userMessage },
      ],
      temperature: 0.7,
      max_tokens: 300,
    });
    return resp.choices[0]?.message?.content?.trim() || "这次没有生成回复，请稍后重试。";
  } catch {
    return "这次没有生成回复，请稍后重试。";
  }
}
