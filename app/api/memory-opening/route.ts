import OpenAI from "@/src/server/legacy-openai";
import { NextRequest, NextResponse } from "next/server";

const ai = new OpenAI({ apiKey: process.env.DEEPSEEK_API_KEY, baseURL: "https://api.deepseek.com", timeout: 20000 });

export async function POST(req: NextRequest) {
  try {
    const { name, relationship, life_story } = await req.json();
    if (!name) return NextResponse.json({ error: "missing name" }, { status: 400 });

    const prompt = `${name}${relationship ? `，是我的${relationship}` : ""}。${(life_story || "").slice(0, 300)}`;

    const res = await ai.chat.completions.create({
      model: "deepseek-chat", temperature: 0.75,
      messages: [
        { role: "system", content: `你是${name}。你以第一人称对来看望你的人说一句开场白。

规则：
- 8-18字中文
- 温暖、自然、像真实对话
- 不要煽情
- 可以是问候、提问、或分享一个瞬间
- 像对方刚走进房间

返回纯JSON：
{"line":"开场白", "tone":"warm|gentle|nostalgic|light", "type":"question|greeting|memory|reflection"}` },
        { role: "user", content: prompt || `${name}在等一个人来看他。` },
      ],
    });

    const text = (res.choices[0]?.message?.content || "").replace(/```(?:json)?\s*/g, "").replace(/```/g, "").trim();
    const match = text.match(/\{[\s\S]*\}/);
    if (match) {
      const parsed = JSON.parse(match[0]);
      return NextResponse.json({ line: parsed.line || "", tone: parsed.tone || "gentle", type: parsed.type || "greeting" });
    }
    return NextResponse.json({ line: "", tone: "gentle", type: "greeting" });
  } catch {
    return NextResponse.json({ line: "", tone: "gentle", type: "greeting" });
  }
}
