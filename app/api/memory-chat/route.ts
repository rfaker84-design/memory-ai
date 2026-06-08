import OpenAI from "openai";
import { createClient } from "@supabase/supabase-js";

const client = new OpenAI({
  apiKey: process.env.DEEPSEEK_API_KEY,
  baseURL: "https://api.deepseek.com",
  timeout: 60000,
});

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export async function POST(request: Request) {
  try {
    const body = await request.json();

    const timelineText = Array.isArray(body.timeline)
      ? body.timeline
          .map(
            (event: any) =>
              `${event.event_year || "未知年份"}：${event.title}${
                event.description ? ` - ${event.description}` : ""
              }`
          )
          .join("\n")
      : "暂无时间线";

    if (body.memory_id && body.question) {
      await supabaseAdmin.from("chat_messages").insert([
        {
          memory_id: body.memory_id,
          role: "user",
          content: body.question,
        },
      ]);
    }

    const completion = await client.chat.completions.create({
      model: "deepseek-chat",
      messages: [
        {
          role: "system",
          content:
            "你是忆见 MemoryAI 的AI记忆陪伴助手。你只能基于用户提供的人生故事和时间线回答，不要编造不存在的事实。用温和、自然、安慰性的中文回答。",
        },
        {
          role: "user",
          content: `亲人姓名：${body.name}
关系：${body.relationship}

人生故事：
${body.life_story || "暂无"}

人生时间线：
${timelineText}

用户问题：
${body.question}`,
        },
      ],
    });

    const answer =
      completion.choices[0]?.message?.content || "暂时没有生成回答。";

    if (body.memory_id && answer) {
      await supabaseAdmin.from("chat_messages").insert([
        {
          memory_id: body.memory_id,
          role: "assistant",
          content: answer,
        },
      ]);
    }

    return Response.json({ answer });
  } catch (error: any) {
    console.error("AI Error:", error);
    return Response.json(
      { error: error?.message || "AI回答失败" },
      { status: 500 }
    );
  }
}