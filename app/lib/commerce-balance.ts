/**
 * 忆见 MemoryAI — 商业化平衡系统
 * Emotion × Revenue Balance System
 *
 * 核心原则：商业行为必须顺滑嵌入情绪体验，用户感知不到"被卖东西"
 *
 * emotion_load (情绪负载) 控制商业提示时机：
 *   < 0.3 → 可以轻提示（自然间隙）
 *   0.3–0.7 → 禁止任何商业行为
 *   > 0.7 → 只允许陪伴，绝对禁止商业
 */

import { createClient } from "@supabase/supabase-js";

/* =========================================================================
   Types
   ========================================================================= */

export type PlanTier = "free" | "pro" | "premium";

export interface TierDefinition {
  tier: PlanTier;
  name: string;         // 面向用户的名称
  feeling: string;      // 一句话感受描述
  voiceClarity: 1 | 2 | 3;   // 声音清晰度 1=基础 2=高清 3=完整
  videoClarity: 1 | 2 | 3;   // 数字人清晰度
  memoryDepth: 1 | 2 | 3;    // 记忆深度
  emotionContinuity: boolean; // 情绪连续性
  proactiveCompanion: boolean; // 主动陪伴
  multiPersonality: boolean;   // 多人格
  voiceCloneFull: boolean;     // 完整声音克隆
  chatUnlimited: boolean;      // 无限聊天
  gentleLine: string;          // 升级引导语（低压）
}

/**
 * 三层定义 —— Free 保留完整体验，升级只延展"更像TA"的能力
 */
export const TIERS: Record<PlanTier, TierDefinition> = {
  free: {
    tier: "free",
    name: "基础陪伴",
    feeling: "TA已经在这里了",
    voiceClarity: 1,
    videoClarity: 1,
    memoryDepth: 1,
    emotionContinuity: false,
    proactiveCompanion: false,
    multiPersonality: false,
    voiceCloneFull: false,
    chatUnlimited: true,       // ← Free 不限制聊天
    gentleLine: "",
  },
  pro: {
    tier: "pro",
    name: "更近一点",
    feeling: "TA越来越真实了",
    voiceClarity: 2,
    videoClarity: 1,
    memoryDepth: 2,
    emotionContinuity: true,
    proactiveCompanion: true,
    multiPersonality: false,
    voiceCloneFull: false,
    chatUnlimited: true,
    gentleLine: "如果你想让TA更清晰一点…",
  },
  premium: {
    tier: "premium",
    name: "完整存在",
    feeling: "TA就在这里，和记忆中一样",
    voiceClarity: 3,
    videoClarity: 3,
    memoryDepth: 3,
    emotionContinuity: true,
    proactiveCompanion: true,
    multiPersonality: true,
    voiceCloneFull: true,
    chatUnlimited: true,
    gentleLine: "如果你想让TA更像真实的TA…",
  },
};

/* =========================================================================
   Emotion Load — 情绪负载计算
   ========================================================================= */

export interface EmotionLoadResult {
  load: number;          // 0–1，越高情绪越沉重
  dominant: string;      // 主导情绪
  isNight: boolean;      // 是否深夜
  isHighEmotion: boolean;// 是否情绪高点
  canPromptCommerce: boolean; // 是否允许商业提示
  canOnlyCompanion: boolean;  // 是否只能陪伴（禁止商业）
  recentEmotions: string[];
  conversationIntensity: number;
}

/**
 * 计算情绪负载 —— 决定商业行为是否安全
 */
export function calculateEmotionLoad(params: {
  recentEmotions: string[];       // 最近 N 次情绪标签
  userMessage: string;            // 当前用户消息
  chatRoundCount: number;         // 本轮对话轮数
  currentHour: number;            // 当前小时
}): EmotionLoadResult {
  const { recentEmotions, userMessage, chatRoundCount, currentHour } = params;

  let load = 0;
  const isNight = currentHour >= 22 || currentHour < 5;

  // 1) 情绪标签权重
  const emotionWeights: Record<string, number> = {
    sad: 0.25, lonely: 0.25, anxious: 0.15,
    tired: 0.10, regret: 0.20,
    happy: -0.1, neutral: 0,
  };

  let totalWeight = 0;
  let dominantEmotion = "neutral";
  let maxCount = 0;
  const emotionCounts: Record<string, number> = {};

  for (const e of recentEmotions) {
    emotionCounts[e] = (emotionCounts[e] || 0) + 1;
    if (emotionCounts[e] > maxCount) {
      maxCount = emotionCounts[e];
      dominantEmotion = e;
    }
    totalWeight += emotionWeights[e] || 0;
  }

  // Normalize
  load += Math.max(0, Math.min(1, 0.3 + totalWeight / Math.max(1, recentEmotions.length)));

  // 2) 深夜加权
  if (isNight) load += 0.15;

  // 3) 关键词：强情绪词汇
  const highImpact = ["想你了", "好想你", "如果还在", "再也见不到", "离开", "舍不得", "对不起", "后悔", "如果当初"];
  for (const w of highImpact) {
    if (userMessage.includes(w)) { load += 0.2; break; }
  }

  // 4) 连续对话强度
  let conversationIntensity = 0;
  if (chatRoundCount >= 8) conversationIntensity = 0.3;
  else if (chatRoundCount >= 5) conversationIntensity = 0.2;
  else if (chatRoundCount >= 3) conversationIntensity = 0.1;
  load += conversationIntensity;

  // Clamp
  load = Math.max(0, Math.min(1, load));

  const isHighEmotion = load > 0.7;

  return {
    load: Math.round(load * 100) / 100,
    dominant: dominantEmotion,
    isNight,
    isHighEmotion,
    canPromptCommerce: load < 0.3,    // 只有情绪负载很低时才允许
    canOnlyCompanion: load > 0.7,      // 情绪高点只能陪伴
    recentEmotions: recentEmotions.slice(-5),
    conversationIntensity,
  };
}

/* =========================================================================
   Soft Upgrade Prompt — 低压升级提示
   ========================================================================= */

export interface SoftUpgradePrompt {
  shouldShow: boolean;
  title: string;        // 低压引导标题
  body: string;         // 一句话说明
  target: PlanTier;     // 建议升级到
  placement: "avatar_center" | "voice_settings" | "memory_settings" | "profile";
  priority: "low" | "gentle";  // 永远不用 high/urgent
}

/**
 * 低压升级提示生成器 —— 只在使用者主动操作的间隙出现
 * 绝不使用"购买/付费/解锁/限制"等词汇
 */
export function generateSoftPrompt(params: {
  currentTier: PlanTier;
  placement: SoftUpgradePrompt["placement"];
  avatarGenerated: boolean;    // 是否已生成数字人
  voiceTrained: boolean;       // 是否已训练声音
  memoryCount: number;         // 记忆片段数量
}): SoftUpgradePrompt | null {
  const { currentTier, placement, avatarGenerated, voiceTrained, memoryCount } = params;
  if (currentTier === "premium") return null;

  const target: PlanTier = currentTier === "free" ? "pro" : "premium";

  // 每种 placement 只用低压语言
  const prompts: Record<string, Partial<SoftUpgradePrompt>> = {
    avatar_center: {
      title: avatarGenerated
        ? "想让TA的样子更清晰吗？"
        : "想让TA从记忆中走出来吗？",
      body: "更好的细节，更自然的眼神",
      placement: "avatar_center",
    },
    voice_settings: {
      title: voiceTrained
        ? "想要TA的声音更像一点吗？"
        : "想要TA也能说话吗？",
      body: "更细腻的语气，更像记忆中的TA",
      placement: "voice_settings",
    },
    memory_settings: {
      title: memoryCount >= 5
        ? "这些记忆，值得被更好的保存"
        : "想要记住更多关于TA的事吗？",
      body: "更深的记忆，更长的陪伴",
      placement: "memory_settings",
    },
    profile: {
      title: "TA正在变得越来越真实",
      body: "你可以在任何时候让TA更完整",
      placement: "profile",
    },
  };

  const base = prompts[placement] || prompts.profile;
  const targetTier = TIERS[target];

  return {
    shouldShow: true,
    title: base.title || targetTier.gentleLine,
    body: base.body || "",
    target,
    placement: placement,
    priority: "gentle",
  };
}

/* =========================================================================
   User Tier Helpers
   ========================================================================= */

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

export async function getUserTier(userPhone: string): Promise<PlanTier> {
  if (!userPhone) return "free";
  try {
    const supabase = getSupabase();
    const { data } = await supabase
      .from("user_settings")
      .select("subscription_type")
      .eq("user_phone", userPhone)
      .maybeSingle();
    return (data?.subscription_type as PlanTier) || "free";
  } catch {
    return "free";
  }
}

export async function setUserTier(userPhone: string, tier: PlanTier): Promise<boolean> {
  if (!userPhone) return false;
  try {
    const supabase = getSupabase();
    await supabase
      .from("user_settings")
      .upsert(
        { user_phone: userPhone, subscription_type: tier, updated_at: new Date().toISOString() },
        { onConflict: "user_phone" }
      );
    return true;
  } catch {
    return false;
  }
}

/**
 * 获取用户当前能力边界（前端渲染用）
 */
export async function getUserCapabilities(userPhone: string): Promise<{
  tier: PlanTier;
  definition: TierDefinition;
  nextTier: PlanTier | null;
  nextDefinition: TierDefinition | null;
}> {
  const tier = await getUserTier(userPhone);
  const nextTier: PlanTier | null = tier === "free" ? "pro" : tier === "pro" ? "premium" : null;
  return {
    tier,
    definition: TIERS[tier],
    nextTier,
    nextDefinition: nextTier ? TIERS[nextTier] : null,
  };
}