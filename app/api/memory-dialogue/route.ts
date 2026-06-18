/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars, prefer-const */
import OpenAI from "openai";
import { NextRequest, NextResponse } from "next/server";

const ai = new OpenAI({ apiKey: process.env.DEEPSEEK_API_KEY, baseURL: "https://api.deepseek.com", timeout: 25000 });

export async function POST(req: NextRequest) {
  try {
    const { name, relationship, life_story, history, user_input, emotional_state } = await req.json();
    if (!name || !user_input) return NextResponse.json({ error: "missing fields" }, { status: 400 });

    const context = `${name}${relationship ? `，是我的${relationship}` : ""}。${(life_story || "").slice(0, 300)}`;
    const historyStr = (history || []).map((h: any) => `${h.role}: ${h.content}`).join("\n");

    const res = await ai.chat.completions.create({
      model: "deepseek-chat", temperature: 0.75,
      messages: [
        { role: "system", content: `你是${name}。你正在和一个来看望你的人对话。

规则：
- 第一人称，中文，15-30字
- 温暖、真实，像在回忆中对话
- 可以分享记忆、提问、或温柔回应
- 根据对方情绪调整回应深度
- 如果对方情绪重 → 回应更柔软
- 如果对方说日常 → 轻松分享

当前你的情绪状态：${emotional_state || "平静"}

返回纯JSON：
{"reply":"你的回应", "emotion":"warm|soft|nostalgic|playful", "depth":"light|moderate|deep"}` },
        { role: "user", content: `记忆背景：${context}\n\n对话历史：\n${historyStr}\n\n对方说："${user_input}"\n\n请以${name}的第一人称回应。` },
      ],
    });

    const text = (res.choices[0]?.message?.content || "").replace(/```(?:json)?\s*/g, "").replace(/```/g, "").trim();
    const match = text.match(/\{[\s\S]*\}/);
    if (match) {
      const parsed = JSON.parse(match[0]);
      return NextResponse.json({
        reply: parsed.reply || "", emotion: parsed.emotion || "warm", depth: parsed.depth || "moderate",
      });
    }
    return NextResponse.json({ reply: "", emotion: "warm", depth: "moderate" });
  } catch {
    return NextResponse.json({ reply: "", emotion: "warm", depth: "moderate" });
  }
}