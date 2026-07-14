import OpenAI from "@/src/server/legacy-openai";
import { NextRequest, NextResponse } from "next/server";

const ai = new OpenAI({
  apiKey: process.env.DEEPSEEK_API_KEY,
  baseURL: "https://api.deepseek.com",
  timeout: 25000,
});

export interface EmotionQuotes {
  surface: string;     // 表层记忆（客观描述）
  emotional: string;   // 情绪记忆（温柔感知）
  deep: string;        // 深层连接（情感核心）
  quote: string;       // 向后兼容 — 显示用的主句子
}

export async function POST(req: NextRequest) {
  try {
    const { name, relationship, life_story } = await req.json();
    if (!name) return NextResponse.json({ error: "missing name" }, { status: 400 });

    const prompt = `${name}${relationship ? `，${relationship}` : ""}。${(life_story || "").slice(0, 300)}`;

    const res = await ai.chat.completions.create({
      model: "deepseek-chat",
      temperature: 0.7,
      messages: [
        {
          role: "system",
          content: `你是记忆叙述者。根据逝者信息生成三个句子，每个10-20字，中文。

返回纯JSON：
{
  "surface": "客观事实描述，如'他喜欢在雨天散步'",
  "emotional": "情绪感知，如'厨房里总是有他的饭香'",
  "deep": "情感核心，如'他还在，只是换了一种方式存在'"
}

规则：克制、温柔、不煽情。像纪录片旁白。`
        },
        { role: "user", content: prompt || `${name}的故事。` },
      ],
    });

    const text = (res.choices[0]?.message?.content || "")
      .replace(/```(?:json)?\s*/g, "").replace(/```/g, "").trim();
    const match = text.match(/\{[\s\S]*\}/);

    if (match) {
      const parsed = JSON.parse(match[0]);
      return NextResponse.json({
        surface: parsed.surface || "",
        emotional: parsed.emotional || "",
        deep: parsed.deep || "",
        quote: parsed.deep || parsed.emotional || parsed.surface || "",
      } as EmotionQuotes);
    }

    return NextResponse.json({ surface: "", emotional: "", deep: "", quote: "" });
  } catch {
    return NextResponse.json({ surface: "", emotional: "", deep: "", quote: "" });
  }
}
