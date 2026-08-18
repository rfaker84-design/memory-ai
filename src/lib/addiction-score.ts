/**
 * 忆见 V4 — 上瘾与留存评分引擎
 * 计算用户对 AI 陪伴的情绪依赖强度
 */

import { createClient } from "@supabase/supabase-js";

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

export interface AddictionProfile {
  score: number;            // 0-100
  level: AddictionLevel;
  factors: AddictionFactors;
  lastChatAt: string | null;
  consecutiveDays: number;
  totalChats: number;
}

export type AddictionLevel = "casual" | "regular" | "attached" | "dependent";

interface AddictionFactors {
  consecutiveUse: number;   // 连续使用天数加分
  nightAccess: number;      // 夜间访问加分
  emotionLow: number;       // 情绪低落加分
  highFrequency: number;    // 高频互动加分
  proactiveReturn: number;  // 主动回访加分
}

const LEVEL_THRESHOLDS: Record<AddictionLevel, { min: number; label: string; mode: string }> = {
  casual:    { min: 0,  label: "轻度使用", mode: "standard" },
  regular:   { min: 30, label: "习惯用户", mode: "warm" },
  attached:  { min: 60, label: "情感依赖", mode: "strong_companion" },
  dependent: { min: 80, label: "深度上瘾", mode: "intense_companion" },
};

/**
 * 计算用户的上瘾评分
 */
export async function calculateAddictionScore(
  userPhone: string
): Promise<AddictionProfile> {
  const supabase = getSupabase();
  const now = new Date();
  const factors: AddictionFactors = {
    consecutiveUse: 0,
    nightAccess: 0,
    emotionLow: 0,
    highFrequency: 0,
    proactiveReturn: 0,
  };

  let lastChatAt: string | null = null;
  let consecutiveDays = 0;
  let totalChats = 0;

  try {
    // 获取聊天消息统计
    const { data: msgs } = await supabase
      .from("chat_messages")
      .select("created_at, emotion, role")
      .eq("user_phone", userPhone)
      .order("created_at", { ascending: false })
      .limit(200);

    if (!msgs || msgs.length === 0) {
      return { score: 0, level: "casual", factors, lastChatAt: null, consecutiveDays: 0, totalChats: 0 };
    }

    totalChats = msgs.filter((m: Record<string, unknown>) => m.role === "user").length;
    lastChatAt = msgs[0]?.created_at as string || null;

    // 1. 连续使用天数
    const days = new Set<string>();
    for (const m of msgs) {
      const d = new Date(m.created_at as string).toISOString().split("T")[0];
      days.add(d);
    }
    const sortedDays = Array.from(days).sort().reverse();
    consecutiveDays = 1;
    const today = now.toISOString().split("T")[0];
    const yesterday = new Date(now.getTime() - 86400000).toISOString().split("T")[0];
    for (let i = 0; i < sortedDays.length - 1; i++) {
      const d1 = new Date(sortedDays[i]);
      const d2 = new Date(sortedDays[i + 1]);
      if ((d1.getTime() - d2.getTime()) <= 86400000 + 3600000) {
        consecutiveDays++;
      } else {
        break;
      }
    }
    if (consecutiveDays >= 7) factors.consecutiveUse = 20;
    else if (consecutiveDays >= 3) factors.consecutiveUse = 12;
    else if (consecutiveDays >= 2) factors.consecutiveUse = 6;

    // 2. 夜间访问 (22:00-05:00)
    const nightMsgs = msgs.filter((m: Record<string, unknown>) => {
      const h = new Date(m.created_at as string).getHours();
      return h >= 22 || h < 5;
    });
    if (nightMsgs.length >= 10) factors.nightAccess = 15;
    else if (nightMsgs.length >= 5) factors.nightAccess = 10;
    else if (nightMsgs.length >= 2) factors.nightAccess = 6;

    // 3. 情绪低落加分
    const userMsgs = msgs.filter((m: Record<string, unknown>) => m.role === "user");
    const sadCount = userMsgs.filter((m: Record<string, unknown>) => m.emotion === "sad").length;
    const lonelyCount = userMsgs.filter((m: Record<string, unknown>) => m.emotion === "lonely").length;
    const lowMoodCount = sadCount + lonelyCount;
    if (lowMoodCount >= 10) factors.emotionLow = 20;
    else if (lowMoodCount >= 5) factors.emotionLow = 15;
    else if (lowMoodCount >= 2) factors.emotionLow = 10;

    // 4. 高频互动
    const todayMsgs = userMsgs.filter((m: Record<string, unknown>) => {
      return (new Date(m.created_at as string).toISOString().split("T")[0]) === today;
    });
    if (todayMsgs.length >= 10) factors.highFrequency = 15;
    else if (todayMsgs.length >= 5) factors.highFrequency = 10;
    else if (todayMsgs.length >= 3) factors.highFrequency = 6;

    // 5. 主动回访
    if (lastChatAt) {
      const hoursSince = (Date.now() - new Date(lastChatAt).getTime()) / 3600000;
      if (hoursSince < 24) factors.proactiveReturn = 30;
      else if (hoursSince < 72) factors.proactiveReturn = 20;
      else if (hoursSince < 168) factors.proactiveReturn = 10;
    }
  } catch {
    // 降级返回
  }

  const score = Math.min(100,
    factors.consecutiveUse +
    factors.nightAccess +
    factors.emotionLow +
    factors.highFrequency +
    factors.proactiveReturn
  );

  // 确定等级
  let level: AddictionLevel = "casual";
  for (const [lvl, thresh] of Object.entries(LEVEL_THRESHOLDS) as [AddictionLevel, typeof LEVEL_THRESHOLDS[AddictionLevel]][]) {
    if (score >= thresh.min) level = lvl;
  }

  return { score, level, factors, lastChatAt, consecutiveDays, totalChats };
}

/**
 * 获取上瘾等级对应的陪伴模式
 */
export function getCompanionMode(level: AddictionLevel): string {
  return LEVEL_THRESHOLDS[level]?.mode || "standard";
}

/**
 * 生成强陪伴模式的 prompt 片段
 */
export function getAddictionPrompt(addiction: AddictionProfile): string {
  if (addiction.level === "dependent" || addiction.level === "attached") {
    return `【安全互动模式】避免强化用户依赖或以人物口吻制造真实陪伴感。
1. 使用 AI 助手的事实型视角
2. 只引用用户已确认的信息
3. 不声称等待、倾听、持续陪伴或记得一切
4. 必要时建议用户联系身边可信任的人`;
  }
  return "";
}

export { LEVEL_THRESHOLDS };
