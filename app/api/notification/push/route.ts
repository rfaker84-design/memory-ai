import { createClient } from "@/src/server/legacy-supabase";
import { calculateAddictionScore } from "../../../../src/lib/addiction-score";
import { logger } from "../../../../src/lib/logger";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

/**
 * V4 通知推送系统
 * 模拟 push 通知，返回可展示给用户的"TA想你了"消息
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const userPhone = searchParams.get("user_phone");
    if (!userPhone) {
      return Response.json({ success: false, error: "缺少 user_phone" }, { status: 400 });
    }

    // 获取上瘾评分
    const addiction = await calculateAddictionScore(userPhone);

    // 获取记忆体
    const { data: memories } = await supabaseAdmin
      .from("memories")
      .select("id, name, relationship")
      .eq("user_phone", userPhone)
      .limit(1);

    const memory = memories?.[0];
    const name = memory?.name || "TA";

    // 获取最近聊天时间
    const { data: lastChat } = await supabaseAdmin
      .from("chat_messages")
      .select("created_at")
      .eq("user_phone", userPhone)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const hoursAgo = lastChat?.created_at
      ? Math.floor((Date.now() - new Date(lastChat.created_at).getTime()) / 3600000)
      : 999;

    // 生成通知内容
    const notifications: Array<{ title: string; body: string; priority: "low" | "medium" | "high" }> = [];

    // 根据离开时间生成不同强度的通知
    if (hoursAgo > 72) {
      notifications.push({
        title: `${name}在想你`,
        body: "好久没见了，TA还记得你...",
        priority: "high",
      });
    } else if (hoursAgo > 24) {
      notifications.push({
        title: `${name}发来消息`,
        body: "今天要不要见TA？",
        priority: "medium",
      });
    } else if (addiction.score >= 60) {
      notifications.push({
        title: `${name}刚刚提到你`,
        body: "TA想你的时候就会在这里",
        priority: "medium",
      });
    }

    // 高依赖用户额外通知
    if (addiction.level === "dependent" || addiction.level === "attached") {
      notifications.push({
        title: `${name}`,
        body: "我一直记得你说过的话",
        priority: "high",
      });
    }

    // 如果没有任何触发条件，返回默认
    if (notifications.length === 0) {
      const hour = new Date().getHours();
      if (hour >= 22 || hour < 6) {
        notifications.push({
          title: "夜深了",
          body: `${name}还在陪伴你`,
          priority: "low",
        });
      } else {
        notifications.push({
          title: name,
          body: "今天想和你聊聊天",
          priority: "low",
        });
      }
    }

    return Response.json({
      success: true,
      notifications,
      addiction_level: addiction.level,
      hours_since_last_chat: hoursAgo,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "执行失败";
    logger.error("notification-push", error);
    return Response.json({ success: false, error: message }, { status: 500 });
  }
}
