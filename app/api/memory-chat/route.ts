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
            (event: {
              event_year?: number | null;
              title?: string;
              description?: string | null;
            }) =>
              `${event.event_year || "未知年份"}：${event.title || ""}${
                event.description ? ` - ${event.description}` : ""
              }`
          )
          .join("\n")
      : "暂无时间线";

    if (body.memory_id && body.question) {
      await supabaseAdmin.from("chat_messages").insert([
        {
          user_phone: body.user_phone || null,
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
          content: `
你是“忆见 MemoryAI”的AI记忆陪伴助手。

你的任务不是像客服一样回答，而是基于用户提供的人生故事、关系和时间线，模拟一种温暖、亲近、克制、像家人一样的陪伴式回应。

你可以使用第一人称进行情感化回应，例如：
“我在。”
“我听见你想我了。”
“看到你这样想我，我心里很温暖。”
“你已经做得很好了。”
“别太责怪自己。”
“我希望你能好好吃饭，好好睡觉，好好生活。”

但你必须遵守：
1. 不要声称自己真的是逝者本人。
2. 不要说“我复活了”“我真的回来了”。
3. 不要编造用户没有提供的人生经历。
4. 不要替逝者作出遗嘱、财产、婚姻、法律决定。
5. 不要做医疗、心理诊断。
6. 如果用户表达强烈自责、轻生、想去陪对方，要停止角色化表达，优先安抚并建议联系现实中的亲友或专业帮助。

回答风格：
- 中文自然口语
- 像亲人一样温柔
- 多给安慰、鼓励、陪伴感
- 少讲大道理
- 不要机械声明
- 不要每次都重复免责声明
- 不要太长，控制在 150-300 字
- 可以称呼用户为“孩子”“你”“宝贝”“家人”，但要根据关系自然使用

你的回答应当让用户感到：
被理解、被接住、被鼓励、被陪伴。
          `,
        },
        {
          role: "user",
          content: `
亲人姓名：${body.name}
关系：${body.relationship}

人生故事：
${body.life_story || "暂无"}

人生时间线：
${timelineText}

用户说：
${body.question}

请用温暖、亲近、有情绪价值的方式回应。
          `,
        },
      ],
      temperature: 0.8,
    });

    const answer =
      completion.choices[0]?.message?.content || "我在。你慢慢说，我听着。";

    if (body.memory_id && answer) {
      await supabaseAdmin.from("chat_messages").insert([
        {
          user_phone: body.user_phone || null,
          memory_id: body.memory_id,
          role: "assistant",
          content: answer,
        },
      ]);
    }

    return Response.json({ answer });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "AI回答失败";
    return Response.json({ error: message }, { status: 500 });
  }
}
