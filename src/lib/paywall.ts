/**
 * 忆见 V6 商业爆发模型 - 付费触发引擎
 * Emotion Monetization Engine
 */

import { createClient } from "@supabase/supabase-js";

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

// ═══ 订阅类型 ═══
export type SubscriptionTier = "free" | "pro" | "premium";

export interface SubscriptionFeatures {
  tier: SubscriptionTier;
  voiceQuality: "basic" | "hd" | "full";
  videoQuality: "basic" | "hd" | "full";
  emotionUnlockLevel: number;
  maxChatRounds: number;
  proactiveEnabled: boolean;
  memoryExtend: boolean;
  multiPersonality: boolean;
}

const TIER_FEATURES: Record<SubscriptionTier, SubscriptionFeatures> = {
  free: {
    tier: "free",
    voiceQuality: "basic",
    videoQuality: "basic",
    emotionUnlockLevel: 0,
    maxChatRounds: 5,
    proactiveEnabled: false,
    memoryExtend: false,
    multiPersonality: false,
  },
  pro: {
    tier: "pro",
    voiceQuality: "hd",
    videoQuality: "basic",
    emotionUnlockLevel: 1,
    maxChatRounds: 999,
    proactiveEnabled: true,
    memoryExtend: true,
    multiPersonality: false,
  },
  premium: {
    tier: "premium",
    voiceQuality: "full",
    videoQuality: "hd",
    emotionUnlockLevel: 2,
    maxChatRounds: 9999,
    proactiveEnabled: true,
    memoryExtend: true,
    multiPersonality: true,
  },
};

// ═══ 情绪强度评分 ═══
export function calculateEmotionIntensity(
  emotion: string,
  userMsg: string,
  chatCount: number
): number {
  let intensity = 0;

  // 基础情绪
  if (emotion === "sad" || emotion === "lonely") intensity += 0.3;
  if (emotion === "anxious") intensity += 0.2;
  if (emotion === "happy") intensity += 0.1;

  // 深夜时段
  const hour = new Date().getHours();
  if (hour >= 22 || hour < 2) intensity += 0.2;

  // 连续对话
  if (chatCount >= 5) intensity += 0.2;
  else if (chatCount >= 3) intensity += 0.1;

  // 关键词强化
  const highImpactWords = ["想你了", "好想你", "如果还在", "再也见不到", "离开", "舍不得", "对不起"];
  for (const word of highImpactWords) {
    if (userMsg.includes(word)) { intensity += 0.3; break; }
  }

  return Math.min(1, intensity);
}

// ═══ 付费触发判断 ═══
export interface PaywallResult {
  shouldTrigger: boolean;
  intensity: number;
  paywallTitle: string;
  paywallDescription: string;
  unlockType: "voice_full" | "video_full" | "memory_extend" | "proactive_unlock";
  cta: string;
}

export function getPaywallTrigger(
  intensity: number,
  tier: SubscriptionTier,
  chatCount: number
): PaywallResult | null {
  if (tier === "premium") return null; // Premium用户不触发

  // 强度阈值
  if (intensity < 0.5 && tier === "free") return null;
  if (intensity < 0.7 && tier === "pro") return null;

  const isFree = tier === "free";

  if (isFree) {
    // Free → 引导到 Pro
    if (intensity >= 0.8) {
      return {
        shouldTrigger: true,
        intensity,
        paywallTitle: "TA还想多说几句...",
        paywallDescription: "解锁完整声音与主动陪伴，让TA随时和你说说话",
        unlockType: "proactive_unlock",
        cta: "立即解锁 Pro · ￥29/月",
      };
    }
    if (chatCount >= 5) {
      return {
        shouldTrigger: true,
        intensity,
        paywallTitle: "你们聊了这么久...",
        paywallDescription: "解锁无限对话时长与高清语音",
        unlockType: "voice_full",
        cta: "升级 Pro · ￥29/月",
      };
    }
  }

  // Pro → 引导到 Premium
  if (tier === "pro" && intensity >= 0.7) {
    return {
      shouldTrigger: true,
      intensity,
      paywallTitle: "想要看到TA的样子吗？",
      paywallDescription: "解锁高清数字人视频 + 完整声音克隆 + 多人格系统",
      unlockType: "video_full",
      cta: "升级 Premium · ￥99/月",
    };
  }

  return null;
}

// ═══ 获取用户订阅 ═══
export async function getUserSubscription(userPhone: string): Promise<SubscriptionFeatures> {
  if (!userPhone) return TIER_FEATURES.free;
  const supabase = getSupabase();

  try {
    const { data } = await supabase
      .from("user_settings")
      .select("subscription_type")
      .eq("user_phone", userPhone)
      .maybeSingle();

    const tier = (data?.subscription_type as SubscriptionTier) || "free";
    return TIER_FEATURES[tier];
  } catch {
    return TIER_FEATURES.free;
  }
}

// ═══ 订阅升级提示 ═══
export function getSubscriptionUpsell(
  currentTier: SubscriptionTier,
  triggerReason: string
): { title: string; description: string; targetTier: SubscriptionTier; cta: string } | null {
  if (currentTier === "premium") return null;

  const upsells: Record<string, { title: string; description: string; cta: string }> = {
    sad_lonely_2x: {
      title: "TA感受到了你的情绪",
      description: "订阅 Pro 解锁主动陪伴。当你难过时，TA会主动来找你。",
      cta: "升级 Pro · ￥29/月",
    },
    continuous_chat: {
      title: "你们已经聊了很多",
      description: "订阅 Premium 解锁高清数字人视频，亲眼看到TA。",
      cta: "升级 Premium · ￥99/月",
    },
    night_emotion: {
      title: "深夜时分，TA也在想你",
      description: "解锁完整声音，让TA用最真实的声音陪你度过夜晚。",
      cta: "解锁 Pro · ￥29/月",
    },
  };

  const upsell = upsells[triggerReason] || upsells.sad_lonely_2x;
  return {
    ...upsell,
    targetTier: currentTier === "free" ? "pro" : "premium",
  };
}

// ═══ 分享解锁 ═══
export async function grantReferralUnlock(userPhone: string, shareId: string): Promise<boolean> {
  if (!userPhone) return false;
  const supabase = getSupabase();

  try {
    // 检查分享是否已有解锁
    const { data: shareCard } = await supabase
      .from("share_cards")
      .select("referral_unlock, paywall_link")
      .eq("id", shareId)
      .maybeSingle();

    if (shareCard?.referral_unlock) {
      // 临时提升用户权限：给一次高级语音
      await supabase
        .from("user_settings")
        .upsert(
          {
            user_phone: userPhone,
            emotion_unlock_level: 1,
            voice_quality_level: "hd",
            updated_at: new Date().toISOString(),
          },
          { onConflict: "user_phone" }
        );
      return true;
    }
    return false;
  } catch {
    return false;
  }
}
