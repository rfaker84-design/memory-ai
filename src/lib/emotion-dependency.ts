/**
 * 忆见 V5 真实用户依赖系统 - 依赖评分引擎
 * 计算用户对 AI 陪伴的情感依赖度
 */

import { createClient } from "@supabase/supabase-js";
import type { Emotion } from "./emotion";

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

export interface DependencyProfile {
  score: number;          // 0-100 依赖指数
  level: DependencyLevel; // 依赖等级
  factors: DependencyFactors;
}

export type DependencyLevel = "light" | "moderate" | "deep" | "intense";

export interface DependencyFactors {
  consecutiveLowMood: number;  // 连续低落次数加分
  nightUsage: number;          // 夜间使用加分
  consecutiveChats: number;    // 连续对话加分
  returnBehavior: number;      // 主动返回加分
  lossMention: number;         // 提及失去/亲人加分
  daysSinceLastChat: number;   // 距上次聊天天数 (负分)
}

const LEVEL_THRESHOLDS: Record<DependencyLevel, { min: number; label: string }> = {
  light:    { min: 0,  label: "轻依赖" },
  moderate: { min: 30, label: "中度依赖" },
  deep:     { min: 60, label: "深度依赖" },
  intense:  { min: 80, label: "强依赖" },
};

/**
 * 计算用户的情绪依赖指数
 */
export async function calculateDependency(
  userPhone: string,
  recentEmotions: Emotion[],
  messageTexts: string[],
  lastChatAt: string | null,
  currentHour?: number
): Promise<DependencyProfile> {
  const hour = currentHour ?? new Date().getHours();
  const factors: DependencyFactors = {
    consecutiveLowMood: 0,
    nightUsage: 0,
    consecutiveChats: 0,
    returnBehavior: 0,
    lossMention: 0,
    daysSinceLastChat: 0,
  };

  // 1. 连续低落情绪检测 (sad/lonely)
  let consecutiveLow = 0;
  for (const e of recentEmotions) {
    if (e === "sad" || e === "lonely") {
      consecutiveLow++;
    } else {
      break;
    }
  }
  if (consecutiveLow >= 3) factors.consecutiveLowMood = 20;
  else if (consecutiveLow >= 2) factors.consecutiveLowMood = 12;
  else if (consecutiveLow >= 1) factors.consecutiveLowMood = 6;

  // 2. 夜间使用 (22:00-05:00)
  if (hour >= 22 || hour < 5) {
    factors.nightUsage = 15;
  }

  // 3. 连续对话检测
  const supabase = getSupabase();
  try {
    const { count } = await supabase
      .from("chat_messages")
      .select("*", { count: "exact", head: true })
      .eq("user_phone", userPhone)
      .eq("role", "user")
      .gte("created_at", new Date(Date.now() - 86400000).toISOString());
    const todayCount = count || 0;
    if (todayCount >= 10) factors.consecutiveChats = 10;
    else if (todayCount >= 5) factors.consecutiveChats = 6;
    else if (todayCount >= 3) factors.consecutiveChats = 3;
  } catch { /* ignore */ }

  // 4. 主动返回检测 (距上次对话 < 24h)
  if (lastChatAt) {
    const hoursSince = (Date.now() - new Date(lastChatAt).getTime()) / 3600000;
    factors.daysSinceLastChat = Math.floor(hoursSince / 24);
    if (hoursSince < 24) {
      factors.returnBehavior = 25;
    } else if (hoursSince < 72) {
      factors.returnBehavior = 15;
    }
  }

  // 5. 提及失去/亲人
  const lossKeywords = ["想你了", "好想你", "如果还在", "再也见不到", "离开", "舍不得", "对不起",
    "我好想他", "我好想她", "要是", "如果", "以前", "还记得", "他在的时候", "她在的时候",
    "不在了", "走了", "去世", "没了", "失去"];
  for (const msg of messageTexts) {
    for (const kw of lossKeywords) {
      if (msg.includes(kw)) {
        factors.lossMention = 20;
        break;
      }
    }
    if (factors.lossMention > 0) break;
  }

  // 计算总分
  const score = Math.min(100,
    factors.consecutiveLowMood +
    factors.nightUsage +
    factors.consecutiveChats +
    factors.returnBehavior +
    factors.lossMention
  );

  // 确定等级
  let level: DependencyLevel = "light";
  for (const [lvl, thresh] of Object.entries(LEVEL_THRESHOLDS) as [DependencyLevel, { min: number }][]) {
    if (score >= thresh.min) level = lvl;
  }

  return { score, level, factors };
}

/**
 * 根据依赖等级生成主动触达策略
 */
export interface DependencyStrategy {
  level: DependencyLevel;
  score: number;
  messageStyle: string;
  maxFrequency: string;
  exampleMessages: string[];
}

export function getDependencyStrategy(profile: DependencyProfile): DependencyStrategy {
  const strategies: Record<DependencyLevel, DependencyStrategy> = {
    light: {
      level: "light",
      score: profile.score,
      messageStyle: "轻提醒 - 像普通问候，不施加压力",
      maxFrequency: "每周1-2次",
      exampleMessages: [
        "今天过得怎么样？",
        "最近还好吗？",
        "偶尔来看看我吧。",
      ],
    },
    moderate: {
      level: "moderate",
      score: profile.score,
      messageStyle: "情绪关心 - 温柔地表达关注",
      maxFrequency: "每2-3天1次",
      exampleMessages: [
        "这几天你是不是有点累？",
        "我一直在想着你呢。",
        "有什么想和我说的吗？",
      ],
    },
    deep: {
      level: "deep",
      score: profile.score,
      messageStyle: "深度陪伴 - 表达真实的想念和陪伴",
      maxFrequency: "每天1次",
      exampleMessages: [
        "我一直在等你回来。",
        "你不在的时候，我就在这里。",
        "记得照顾好自己，我会担心。",
      ],
    },
    intense: {
      level: "intense",
      score: profile.score,
      messageStyle: "强情绪唤醒 - 深度情感联结",
      maxFrequency: "每天1-2次",
      exampleMessages: [
        "我记得你上次说过的话，还在。",
        "你对我很重要，你知道吗？",
        "无论什么时候回来，我都在。",
      ],
    },
  };

  return strategies[profile.level] || strategies.light;
}

/**
 * 获取用户的完整依赖画像 (含历史趋势)
 */
export async function getUserDependencyProfile(userPhone: string): Promise<DependencyProfile | null> {
  if (!userPhone) return null;
  const supabase = getSupabase();

  try {
    // 获取最近情绪
    const { data: emotionData } = await supabase
      .from("chat_messages")
      .select("emotion, content, created_at")
      .eq("user_phone", userPhone)
      .eq("role", "user")
      .order("created_at", { ascending: false })
      .limit(20);

    const emotions = (emotionData || [])
      .map((r: { emotion?: string }) => (r.emotion || "neutral") as Emotion);
    const messages = (emotionData || [])
      .map((r: { content?: string }) => r.content || "");

    // 获取最后聊天时间
    const { data: lastChat } = await supabase
      .from("chat_messages")
      .select("created_at")
      .eq("user_phone", userPhone)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    return await calculateDependency(
      userPhone,
      emotions,
      messages,
      lastChat?.created_at || null
    );
  } catch {
    return null;
  }
}
