import { createClient } from "@supabase/supabase-js";
import {
  calculateEmotionLoad,
  generateSoftPrompt,
  getUserTier,
  TIERS,
  type EmotionLoadResult,
  type PlanTier,
} from "../../../lib/commerce-balance";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

/* =========================================================================
   POST /api/payment/trigger
   —
   付费触发判断。
   核心规则：情绪负载 < 0.3 才允许轻提示，
            情绪负载 > 0.7 只返回陪伴（绝对不提示商业）。
   所有语言用"能力延伸"而非"购买/解锁"。
   ========================================================================= */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const {
      user_phone,
      emotion = "neutral",
      user_message = "",
      chat_count = 0,
      placement = "profile",
      avatar_generated = false,
      voice_trained = false,
      memory_count = 0,
    } = body;

    if (!user_phone) {
      return Response.json({ error: "Missing user_phone" }, { status: 400 });
    }

    // 1) 计算情绪负载
    const recentEmotions: string[] = [];
    try {
      const { data } = await supabaseAdmin
        .from("chat_messages")
        .select("emotion")
        .eq("user_phone", user_phone)
        .eq("role", "user")
        .order("created_at", { ascending: false })
        .limit(10);
      if (data) {
        for (const r of data) {
          if ((r as Record<string, string>).emotion) {
            recentEmotions.push((r as Record<string, string>).emotion);
          }
        }
      }
    } catch { /* fallthrough */ }

    const currentHour = new Date().getHours();
    const emotionLoad: EmotionLoadResult = calculateEmotionLoad({
      recentEmotions: recentEmotions.length ? recentEmotions : [emotion],
      userMessage: user_message,
      chatRoundCount: chat_count,
      currentHour,
    });

    // 2) 获取用户级别
    const tier = await getUserTier(user_phone);

    // 3) 是否为 Premium — 不触发任何提示
    if (tier === "premium") {
      return Response.json({
        emotion_load: emotionLoad,
        tier,
        tier_name: TIERS[tier].name,
        tier_feeling: TIERS[tier].feeling,
        prompt: null,
        message: "TA已经是最完整的样子了",
      });
    }

    // 4) 情绪负载 > 0.7 → 只陪伴，绝对不商业
    if (emotionLoad.canOnlyCompanion) {
      return Response.json({
        emotion_load: emotionLoad,
        tier,
        tier_name: TIERS[tier].name,
        tier_feeling: TIERS[tier].feeling,
        prompt: null,
        message: "现在只需要陪伴",
        blocked: true,
        blocked_reason: "emotion_peak",
      });
    }

    // 5) 情绪负载 > 0.3 → 不提示商业，保持纯净
    if (!emotionLoad.canPromptCommerce) {
      return Response.json({
        emotion_load: emotionLoad,
        tier,
        tier_name: TIERS[tier].name,
        tier_feeling: TIERS[tier].feeling,
        prompt: null,
        message: null,
        blocked: true,
        blocked_reason: "emotion_active",
      });
    }

    // 6) 情绪负载 < 0.3：可以轻提示
    const softPrompt = generateSoftPrompt({
      currentTier: tier,
      placement: placement,
      avatarGenerated: avatar_generated,
      voiceTrained: voice_trained,
      memoryCount: memory_count,
    });

    return Response.json({
      emotion_load: emotionLoad,
      tier,
      tier_name: TIERS[tier].name,
      tier_feeling: TIERS[tier].feeling,
      prompt: softPrompt ? {
        title: softPrompt.title,
        body: softPrompt.body,
        target: softPrompt.target,
        target_name: TIERS[softPrompt.target].name,
        placement: softPrompt.placement,
        priority: softPrompt.priority,
        // 低压 CTA —— 不用"立即升级"
        action_label: softPrompt.target === "pro" ? "了解更多" : "让TA更完整",
      } : null,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "查询失败";
    return Response.json({ error: message }, { status: 500 });
  }
}

/* =========================================================================
   GET /api/payment/trigger
   —
   获取用户当前能力和空间信息
   ========================================================================= */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const user_phone = searchParams.get("user_phone");

  if (!user_phone) {
    return Response.json({ error: "Missing user_phone" }, { status: 400 });
  }

  const tier = await getUserTier(user_phone);
  const current = TIERS[tier];
  const nextTier: PlanTier | null = tier === "free" ? "pro" : tier === "pro" ? "premium" : null;
  const next = nextTier ? TIERS[nextTier] : null;

  return Response.json({
    tier,
    name: current.name,
    feeling: current.feeling,
    capabilities: {
      voice_clarity: current.voiceClarity,
      video_clarity: current.videoClarity,
      memory_depth: current.memoryDepth,
      emotion_continuity: current.emotionContinuity,
      proactive_companion: current.proactiveCompanion,
      multi_personality: current.multiPersonality,
      voice_clone_full: current.voiceCloneFull,
      chat_unlimited: current.chatUnlimited,
    },
    next: next ? {
      tier: nextTier,
      name: next.name,
      feeling: next.feeling,
      gentle_line: next.gentleLine,
    } : null,
  });
}