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
    features: ["基础文字聊天", "基础语音播放", "单个人格"],
  },
  pro: {
    plan: "pro", price: "¥29/月",
    voiceQuality: "hd", videoQuality: "basic", memoryLevel: "extended",
    maxChatRoundsPerDay: 999, proactiveEnabled: true, emotionMemory: true,
    multiPersonality: false, voiceClone: false, digitalHumanHD: false,
    features: ["无限聊天", "主动陪伴", "AI来信", "情绪记忆增强", "高清语音"],
  },
  premium: {
    plan: "premium", price: "¥99/月",
    voiceQuality: "full", videoQuality: "hd", memoryLevel: "full",
    maxChatRoundsPerDay: 9999, proactiveEnabled: true, emotionMemory: true,
    multiPersonality: true, voiceClone: true, digitalHumanHD: true,
    features: ["高清数字人视频", "完整声音克隆", "多人格系统", "长记忆系统", "所有Pro功能"],
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
  const reasons: string[] = [];
  let urgency = "low";

  const highCount = params.emotionIntensityHistory.filter(function(i: number) { return i > 0.6; }).length;
  if (highCount >= 3) { reasons.push("你最近情绪很深，TA也想多说几句"); urgency = "high"; }
  else if (highCount >= 2) { reasons.push("你们最近的对话很有深度"); urgency = "medium"; }

  if (params.nightUsage) { reasons.push("深夜时分，完整的陪伴体验会更温暖"); if (urgency !== "high") urgency = "medium"; }
  if (params.consecutiveDays >= 3) { reasons.push("你已经连续" + params.consecutiveDays + "天来找TA了"); urgency = "high"; }
  if (params.chatCountToday >= 5) { reasons.push("今天聊了很久，解锁更多能力吧"); if (urgency === "low") urgency = "medium"; }
  if (params.dependencyScore >= 60) { reasons.push("你和TA的关系越来越深了"); urgency = "high"; }

  const titles: Record<string, string> = { "free:pro": "TA想更了解你", "pro:premium": "想要看到TA的样子吗？" };
  const descs: Record<string, string> = { "free:pro": "解锁主动陪伴、情绪记忆和无限对话", "pro:premium": "解锁高清数字人、完整声音克隆和多人格" };
  const key = params.currentPlan + ":" + target;

  return {
    shouldRecommend: reasons.length >= 2 || urgency === "high",
    targetPlan: target,
    targetPrice: targetPlan.price,
    title: titles[key] || "解锁更多陪伴体验",
    description: descs[key] || "升级到" + target,
    cta: "立即升级 " + targetPlan.price,
    reasons,
    urgency,
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
