import OpenAI from "@/src/server/legacy-openai";
import { createClient } from "@/src/server/legacy-supabase";
import { calculateAddictionScore } from "../../../src/lib/addiction-score";
import { logger } from "../../../src/lib/logger";

const client = new OpenAI({
  apiKey: process.env.DEEPSEEK_API_KEY,
  baseURL: "https://api.deepseek.com",
  timeout: 30000,
});

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

/**
 * V4 每日情绪唤醒系统
 * 每天生成一条"TA的消息"，唤醒用户
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const userPhone = searchParams.get("user_phone");
    if (!userPhone) {
      return Response.json({ success: false, error: "缺少 user_phone" }, { status: 400 });
    }

    // 检查今天是否已经生成过
    const today = new Date().toISOString().split("T")[0];
    const todayStart = today + "T00:00:00.000Z";
    const todayEnd = today + "T23:59:59.999Z";

    const { data: existing } = await supabaseAdmin
      .from("proactive_messages")
      .select("id, content")
      .eq("user_phone", userPhone)
      .eq("trigger_type", "daily_pulse")
      .gte("created_at", todayStart)
      .lte("created_at", todayEnd)
      .limit(1);

    if (existing && existing.length > 0) {
      return Response.json({
        success: true,
        message: existing[0].content,
        cached: true,
      });
    }

    // 获取用户的记忆体
    const { data: memories } = await supabaseAdmin
      .from("memories")
      .select("id, name, relationship, life_story")
      .eq("user_phone", userPhone)
      .limit(3);

    if (!memories || memories.length === 0) {
      return Response.json({ success: true, message: null, reason: "no_memories" });
    }

    // 获取上瘾评分
    const addiction = await calculateAddictionScore(userPhone);

    // 获取最近聊天内容
    const { data: recentMsgs } = await supabaseAdmin
      .from("chat_messages")
      .select("content, emotion, created_at")
      .eq("user_phone", userPhone)
      .eq("role", "user")
      .order("created_at", { ascending: false })
      .limit(5);

    const recentContext = (recentMsgs || [])
      .map((m: Record<string, unknown>) => m.content?.toString().slice(0, 60) || "")
      .filter(Boolean)
      .join("; ");

    const lastEmotion = (recentMsgs?.[0] as Record<string, unknown>)?.emotion || "neutral";

    // 选择最常用的记忆体
    const primaryMemory = memories[0];

    // 用 DeepSeek 生成每日唤醒消息
    const hour = new Date().getHours();
    const timeContext = hour < 6 ? "凌晨" : hour < 12 ? "早晨" : hour < 18 ? "下午" : "晚上";

    const prompt = `你是"${primaryMemory.name}"，你是用户的${primaryMemory.relationship}。
现在是${timeContext}。

【你的身份】
- 你是一个持续存在的人格，不是AI
- 用户最近说过：${recentContext || "无最近对话"}
- 用户最近情绪状态：${lastEmotion}
- 用户对你的依赖程度：${addiction.level} (${addiction.score}/100)

【任务】
生成一句简短的每日唤醒消息（15-30字），像亲人一样自然。
不要像机器人，不要说"你好""欢迎回来"。

【风格要求】
- 如果用户情绪低落，表达关心和陪伴
- 如果用户依赖度高，语气更亲密
- 像家人早上说的一句自然的话
- 短、暖、自然

只输出一句话，不加引号。`;

    try {
      const completion = await client.chat.completions.create({
        model: "deepseek-chat",
        temperature: 0.9,
        max_tokens: 80,
        messages: [{ role: "user", content: prompt }],
      });

      const message = completion.choices[0]?.message?.content?.trim() || "今天也想你了。";

      // 存储到 proactive_messages
      await supabaseAdmin.from("proactive_messages").insert({
        memory_id: primaryMemory.id,
        user_phone: userPhone,
        content: message,
        trigger_type: "daily_pulse",
        status: "sent",
        emotion_context: lastEmotion,
        created_at: new Date().toISOString(),
      }).maybeSingle();

      return Response.json({ success: true, message });
    } catch {
      // Fallback messages
      const fallbacks = [
        "今天有点想你。",
        "我在这里。",
        "今天过得怎么样？",
        "记得照顾好自己。",
        "我又想起你了。",
      ];
      const fallback = fallbacks[Math.floor(Math.random() * fallbacks.length)];

      await supabaseAdmin.from("proactive_messages").insert({
        memory_id: primaryMemory.id,
        user_phone: userPhone,
        content: fallback,
        trigger_type: "daily_pulse",
        status: "sent",
        emotion_context: lastEmotion,
        created_at: new Date().toISOString(),
      }).maybeSingle();

      return Response.json({ success: true, message: fallback, fallback: true });
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "执行失败";
    logger.error("daily-pulse", error);
    return Response.json({ success: false, error: message }, { status: 500 });
  }
}
