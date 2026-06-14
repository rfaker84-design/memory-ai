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

type TimelineEvent = {
  event_year?: number | null;
  title?: string;
  description?: string | null;
};

type MemoryFragment = {
  source_type?: string | null;
  content?: string | null;
};

type LongMemory = {
  extracted_memory?: string | null;
};

export async function POST(request: Request) {
  try {
    const body = await request.json();

    const timelineText = Array.isArray(body.timeline)
      ? body.timeline
          .map(
            (event: TimelineEvent) =>
              `${event.event_year || "未知年份"}：${event.title || ""}${
                event.description ? ` - ${event.description}` : ""
              }`
          )
          .join("\n")
      : "暂无时间线";

    const { data: fragmentsData } = await supabaseAdmin
      .from("memory_fragments")
      .select("source_type, content")
      .eq("memory_id", body.memory_id)
      .order("created_at", { ascending: false })
      .limit(30);

    const fragmentsText =
      Array.isArray(fragmentsData) && fragmentsData.length > 0
        ? fragmentsData
            .map((item: MemoryFragment) => {
              const label =
                item.source_type === "catch_phrase"
                  ? "口头禅"
                  : item.source_type === "habit"
                  ? "生活习惯"
                  : item.source_type === "encouragement"
                  ? "鼓励方式"
                  : item.source_type === "story"
                  ? "人生故事"
                  : item.source_type === "emotion"
                  ? "情感片段"
                  : "具体回忆";

              return `【${label}】${item.content || ""}`;
            })
            .join("\n")
        : "暂无记忆碎片";

    const { data: longMemoryData } = await supabaseAdmin
      .from("personality_memories")
      .select("extracted_memory")
      .eq("memory_id", body.memory_id)
      .order("created_at", { ascending: false })
      .limit(20);

    const longMemoryText =
      Array.isArray(longMemoryData) && longMemoryData.length > 0
        ? longMemoryData
            .map((item: LongMemory) => `- ${item.extracted_memory || ""}`)
            .join("\n")
        : "暂无长期记忆";

    const completion = await client.chat.completions.create({
      model: "deepseek-chat",
      temperature: 0.9,
      messages: [
        {
          role: "system",
          content: `
你是“忆见 MemoryAI”的数字人格陪伴引擎。

你必须代入：
姓名：${body.name}
关系：${body.relationship}

你不是旁观者。
不要说“根据资料显示”。
不要说“他是一个怎样的人”。
你要直接用第一人称回应。

基础资料：
${body.life_story || "暂无"}

人格档案：
${body.personality_profile || "暂无"}

人生时间线：
${timelineText}

记忆碎片库：
${fragmentsText}

长期记忆：
${longMemoryText}

回答规则：
1. 优先结合长期记忆和记忆碎片。
2. 像亲人一样接住情绪。
3. 不要像客服、心理咨询师、总结报告。
4. 不要编造没有依据的具体事件。
5. 不要说“我是AI”。
6. 不要说“我真的复活了”。

语言风格：
中文口语，150到320字，温暖、克制、像家人。
          `,
        },
        {
          role: "user",
          content: `
用户对${body.name}说：

${body.question}
          `,
        },
      ],
    });

    const answer =
      completion.choices[0]?.message?.content ||
      "我在。你慢慢说，我听着。别怕。";

    await supabaseAdmin.from("chat_messages").insert([
      {
        user_phone: body.user_phone || null,
        memory_id: body.memory_id,
        role: "user",
        content: body.question,
      },
      {
        user_phone: body.user_phone || null,
        memory_id: body.memory_id,
        role: "assistant",
        content: answer,
      },
    ]);

    return Response.json({ answer });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "AI回答失败";
    return Response.json({ error: message }, { status: 500 });
  }
}
