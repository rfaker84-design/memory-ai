/**
 * 忆见 V6 商业闭环 - 订阅管理引擎
 * 三层付费体系 + 转化优化 + 限制检查
 */

import { createClient } from "@supabase/supabase-js";

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

export type PlanType = "free" | "pro" | "premium";

export interface SubscriptionPlan {
  plan: PlanType;
  price: string;
  voiceQuality: "basic" | "hd" | "full";
  videoQuality: "basic" | "hd" | "full";
  memoryLevel: "basic" | "extended" | "full";
  maxChatRoundsPerDay: number;
  proactiveEnabled: boolean;
  emotionMemory: boolean;
  multiPersonality: boolean;
  voiceClone: boolean;
  digitalHumanHD: boolean;
  features: string[];
}

export const PLANS: Record<PlanType, SubscriptionPlan> = {
  free: {
    plan: "free", price: "免费",
    voiceQuality: "basic", videoQuality: "basic", memoryLevel: "basic",
    maxChatRoundsPerDay: 10, proactiveEnabled: false, emotionMemory: false,
    multiPersonality: false, voiceClone: false, digitalHumanHD: false,
    features: ["基础文字聊天", "基础功能说明", "单个 TA 档案"],
  },
  pro: {
    plan: "pro", price: "¥29/月",
    voiceQuality: "hd", videoQuality: "basic", memoryLevel: "extended",
    maxChatRoundsPerDay: 999, proactiveEnabled: false, emotionMemory: false,
    multiPersonality: false, voiceClone: false, digitalHumanHD: false,
    features: ["更多聊天额度", "高清语音", "明确的功能说明"],
  },
  premium: {
    plan: "premium", price: "¥99/月",
    voiceQuality: "full", videoQuality: "hd", memoryLevel: "full",
    maxChatRoundsPerDay: 9999, proactiveEnabled: false, emotionMemory: false,
    multiPersonality: true, voiceClone: true, digitalHumanHD: true,
    features: ["高清纪念影像", "经授权的声音功能", "更多已确认资料容量", "所有 Pro 功能"],
  },
};

export async function getUserPlan(userPhone: string): Promise<{ plan: PlanType; voiceQuality: string; videoQuality: string }> {
  if (!userPhone) return { plan: "free", voiceQuality: "basic", videoQuality: "basic" };
  const supabase = getSupabase();
  try {
    const { data } = await supabase
      .from("user_settings")
      .select("subscription_type, voice_quality_level, video_quality_level")
      .eq("user_phone", userPhone)
      .maybeSingle();
    return {
      plan: (data?.subscription_type as PlanType) || "free",
      voiceQuality: data?.voice_quality_level || "basic",
      videoQuality: data?.video_quality_level || "basic",
    };
  } catch {
    return { plan: "free", voiceQuality: "basic", videoQuality: "basic" };
  }
}

export function getUpgradeTarget(current: PlanType): PlanType {
  if (current === "free") return "pro";
  return "premium";
}

export function analyzeConversionReadiness(params: {
  currentPlan: PlanType;
  emotionIntensityHistory: number[];
  nightUsage: boolean;
  consecutiveDays: number;
  chatCountToday: number;
  dependencyScore: number;
}): { shouldRecommend: boolean; targetPlan: PlanType; targetPrice: string; title: string; description: string; cta: string; reasons: string[]; urgency: string } {
  const target = getUpgradeTarget(params.currentPlan);
  const targetPlan = PLANS[target];
  // Emotional state, nighttime use, repeated visits and dependency signals must
  // never trigger a commercial prompt. This legacy API has no explicit user
  // request signal, so it remains fail-closed until a separately reviewed,
  // user-initiated pricing surface calls it with that contract.
  void params;

  return {
    shouldRecommend: false,
    targetPlan: target,
    targetPrice: targetPlan.price,
    title: "可选功能与价格",
    description: "如需了解可选功能、价格和退款规则，请主动前往服务说明。",
    cta: "查看服务说明",
    reasons: [],
    urgency: "low",
  };
}

export async function grantShareUnlock(userPhone: string): Promise<boolean> {
  if (!userPhone) return false;
  const supabase = getSupabase();
  try {
    const res = await supabase.from("user_settings").select("referral_unlocks").eq("user_phone", userPhone).maybeSingle();
    const unlocks = ((res.data?.referral_unlocks as number) || 0) + 1;
    await supabase.from("user_settings").upsert({ user_phone: userPhone, referral_unlocks: unlocks, updated_at: new Date().toISOString() }, { onConflict: "user_phone" });
    return true;
  } catch { return false; }
}

export async function consumeTrialVoice(userPhone: string): Promise<boolean> {
  if (!userPhone) return false;
  const supabase = getSupabase();
  try {
    const res = await supabase.from("user_settings").select("referral_unlocks, subscription_type").eq("user_phone", userPhone).maybeSingle();
    if (res.data?.subscription_type === "pro" || res.data?.subscription_type === "premium") return true;
    const unlocks = (res.data?.referral_unlocks as number) || 0;
    if (unlocks <= 0) return false;
    await supabase.from("user_settings").update({ referral_unlocks: unlocks - 1, updated_at: new Date().toISOString() }).eq("user_phone", userPhone);
    return true;
  } catch { return false; }
}
