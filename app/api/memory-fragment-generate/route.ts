import OpenAI from "openai";
import { NextRequest, NextResponse } from "next/server";

const ai = new OpenAI({
  apiKey: process.env.DEEPSEEK_API_KEY,
  baseURL: "https://api.deepseek.com",
  timeout: 20000,
});

export async function POST(req: NextRequest) {
  try {
    const { name, relationship, life_story, emotional_state } = await req.json();
    if (!name) return NextResponse.json({ fragments: [] });

    const prompt = `${name}${relationship ? `，${relationship}` : ""}。${(life_story || "").slice(0, 300)}。当前情绪：${emotional_state || "平静"}`;

    const res = await ai.chat.completions.create({
      model: "deepseek-chat",
      temperature: 0.8,
      messages: [
        {
          role: "system",
          content: `你是记忆生成器。根据逝者信息和当前情绪状态，生成3个新的记忆片段。

返回纯JSON：
{"fragments":["8-20字的记忆片段1","片段2","片段3"]}

规则：
- 片段感，像碎片记忆，不是完整叙述
- 不要煽情
- 基于life_story风格生成
- 中文`
        },
        { role: "user", content: prompt || `${name}的记忆。` },
      ],
    });

    const text = (res.choices[0]?.message?.content || "")
      .replace(/```(?:json)?\s*/g, "").replace(/```/g, "").trim();
    const match = text.match(/\{[\s\S]*\}/);

    if (match) {
      const parsed = JSON.parse(match[0]);
      return NextResponse.json({ fragments: parsed.fragments || [] });
    }

    return NextResponse.json({ fragments: [] });
  } catch {
    return NextResponse.json({ fragments: [] });
  }
}