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

  const prompt = `你是一个温柔克制的叙述者。请为以下记忆生成一句话，让用户感受到这个人"仍然以某种方式存在"。

名字：${name}
关系：${rel}
生平片段：${lifeStory?.slice(0, 200) || "（无详细记录）"}

要求：
- 一句话，不超过30字
- 克制、温柔、不煽情
- 像"轻声说话"
- 不要使用"虽然...但是..."句式
- 不要说你很遗憾、很难过
- 示例语调："他还在这里，只是换了一种方式存在。"

请只输出这一句话，不要任何其他内容。`;

  try {
    const client = getClient();
    const resp = await client.chat.completions.create({
      model: process.env.AI_MODEL || "deepseek-chat",
      messages: [{ role: "user", content: prompt }],
      temperature: 0.7,
      max_tokens: 80,
    });
    return resp.choices[0]?.message?.content?.trim() || "他还在。";
  } catch {
    return "他还在。";
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

你正在代表"${name}"与用户对话。${name}是用户的${rel}。

关于${name}的生平：${lifeStory?.slice(0, 500) || "（记录不多）"}

对话规则：
1. 只能基于生平信息回答，不要编造
2. 保持温柔、克制的语气
3. 回复简短（2-4句话）
4. 可以使用"我记得..."、"那时候..."开头
5. 如果用户问超出记忆范围的事，温和地说"那些细节我已经记不太清了"
6. 不要过度煽情
7. 始终保持${name}的第一人称视角`;

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
    return resp.choices[0]?.message?.content?.trim() || "嗯...我在这里。";
  } catch {
    return "我现在有点恍惚...但还在的。";
  }
}
