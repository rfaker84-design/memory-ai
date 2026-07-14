import OpenAI from "@/src/server/legacy-openai";
import { NextRequest, NextResponse } from "next/server";

const client = new OpenAI({
  apiKey: process.env.DEEPSEEK_API_KEY,
  baseURL: "https://api.deepseek.com",
});

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    const response = await client.chat.completions.create({
      model: "deepseek-chat",
      temperature: 0.8,
      messages: [
        {
          role: "system",
          content: `
你是顶级人物人格分析专家。

请从资料中提取：

1 性格特征
2 说话风格
3 常用口头禅
4 人生价值观

返回JSON

{
 "personality_tags":"",
 "speech_style":"",
 "catch_phrases":"",
 "values_belief":""
}

不要返回其它内容。
          `,
        },
        {
          role: "user",
          content: body.lifeStory,
        },
      ],
    });

    return NextResponse.json({
      result: response.choices[0].message.content,
    });
  } catch {
    return NextResponse.json(
      { error: "人格生成失败" },
      { status: 500 }
    );
  }
}
