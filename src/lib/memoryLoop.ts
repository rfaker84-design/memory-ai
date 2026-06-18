// ╔══════════════════════════════════════════════════════════════╗
// ║  memoryLoop.ts — AI记忆增强闭环 (V6 核心护城河)           ║
// ║  情绪历史 → 人格模型更新 → 个性化回应增强                 ║
// ╚══════════════════════════════════════════════════════════════╝

import type { Emotion } from "./volc";

// ═══════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════
export interface EmotionLog {
  timestamp: string;
  emotion: Emotion;
  intensity: number;
  topic?: string;
  userMessage: string;
}

export interface PersonalityModel {
  dominantEmotion: Emotion;
  emotionDiversity: number;       // 0-1, 越高越丰富
  volatility: number;             // 情绪波动性
  attachmentStyle: "secure" | "anxious" | "avoidant" | "developing";
  responseTone: "gentle" | "warm" | "calm" | "direct" | "playful";
  familiarityLevel: number;       // 0-100, AI对用户的熟悉度
  lastUpdated: string;
}

export interface MemoryLoopState {
  userId: string;
  memoryId: string;
  emotionLog: EmotionLog[];       // 最近100条
  personality: PersonalityModel;
  interactionCount: number;
  uniqueDays: number;
  lastInteractionAt: string;
}

// ═══════════════════════════════════════════════════════════════
// 内存存储（生产用 Supabase 持久化）
// ═══════════════════════════════════════════════════════════════
const states = new Map<string, MemoryLoopState>();

function key(userId: string, memoryId: string): string {
  return userId + ":" + memoryId;
}

function getOrCreate(userId: string, memoryId: string): MemoryLoopState {
  const k = key(userId, memoryId);
  const existing = states.get(k);
  if (existing) return existing;

  const state: MemoryLoopState = {
    userId,
    memoryId,
    emotionLog: [],
    personality: {
      dominantEmotion: "calm",
      emotionDiversity: 0,
      volatility: 0,
      attachmentStyle: "developing",
      responseTone: "gentle",
      familiarityLevel: 0,
      lastUpdated: new Date().toISOString(),
    },
    interactionCount: 0,
    uniqueDays: 0,
    lastInteractionAt: new Date().toISOString(),
  };

  states.set(k, state);
  return state;
}

// ═══════════════════════════════════════════════════════════════
// 记录情绪事件
// ═══════════════════════════════════════════════════════════════
export function logEmotion(
  userId: string,
  memoryId: string,
  emotion: Emotion,
  userMessage: string,
  intensity = 0.5,
  topic?: string,
): void {
  const state = getOrCreate(userId, memoryId);

  state.emotionLog.push({
    timestamp: new Date().toISOString(),
    emotion,
    intensity,
    topic,
    userMessage: userMessage.slice(0, 200),
  });

  // 只保留最近100条
  if (state.emotionLog.length > 100) {
    state.emotionLog = state.emotionLog.slice(-100);
  }

  state.interactionCount++;
  state.lastInteractionAt = new Date().toISOString();

  // 更新唯一天数
  const today = new Date().toISOString().slice(0, 10);
  const dates = new Set(state.emotionLog.map(e => e.timestamp.slice(0, 10)));
  state.uniqueDays = dates.size;

  // 更新人格模型
  updatePersonality(state);
}

// ═══════════════════════════════════════════════════════════════
// 人格模型更新
// ═══════════════════════════════════════════════════════════════
function updatePersonality(state: MemoryLoopState): void {
  const logs = state.emotionLog;
  if (logs.length < 3) return;

  // 主导情绪
  const emotionCounts: Record<string, number> = {};
  for (const log of logs) {
    emotionCounts[log.emotion] = (emotionCounts[log.emotion] || 0) + 1;
  }
  const dominant = Object.entries(emotionCounts).sort((a, b) => b[1] - a[1])[0][0] as Emotion;

  // 情绪多样性
  const uniqueEmotions = Object.keys(emotionCounts).length;
  const diversity = Math.min(1, uniqueEmotions / 4);

  // 波动性（相邻情绪变化次数）
  let changes = 0;
  for (let i = 1; i < logs.length; i++) {
    if (logs[i].emotion !== logs[i - 1].emotion) changes++;
  }
  const volatility = Math.min(1, changes / Math.max(logs.length - 1, 1));

  // 依附风格
  let attachmentStyle: PersonalityModel["attachmentStyle"] = "developing";
  if (state.interactionCount > 100 && volatility < 0.3) {
    attachmentStyle = "secure";
  } else if (state.interactionCount > 30 && dominant === "sad") {
    attachmentStyle = "anxious";
  } else if (state.interactionCount > 20 && dominant === "calm" && volatility < 0.4) {
    attachmentStyle = "secure";
  }

  // 回应语气
  const toneMap: Record<Emotion, PersonalityModel["responseTone"]> = {
    warm: "warm",
    calm: "calm",
    sad: "gentle",
    nostalgic: "gentle",
  };
  const responseTone = toneMap[dominant] || "calm";

  // 熟悉度（基于互动次数和天数）
  const familiarity = Math.min(100,
    (state.interactionCount * 0.5) + (state.uniqueDays * 2)
  );

  state.personality = {
    dominantEmotion: dominant,
    emotionDiversity: diversity,
    volatility,
    attachmentStyle,
    responseTone,
    familiarityLevel: familiarity,
    lastUpdated: new Date().toISOString(),
  };
}

// ═══════════════════════════════════════════════════════════════
// 获取个性化AI上下文
// ═══════════════════════════════════════════════════════════════
export function getPersonalizationContext(
  userId: string,
  memoryId: string,
): {
  personality: PersonalityModel;
  personalizationHint: string;
  isReturningUser: boolean;
  familiarity: "new" | "familiar" | "close" | "intimate";
} {
  const state = getOrCreate(userId, memoryId);
  const p = state.personality;

  let familiarity: "new" | "familiar" | "close" | "intimate" = "new";
  if (p.familiarityLevel >= 80) familiarity = "intimate";
  else if (p.familiarityLevel >= 50) familiarity = "close";
  else if (p.familiarityLevel >= 20) familiarity = "familiar";

  // 生成个性化提示词
  const toneHints: Record<string, string> = {
    gentle: "用温柔克制的语气回应",
    warm: "用温暖亲近的语气回应",
    calm: "用平静安稳的语气回应",
    direct: "用直接真诚的语气回应",
    playful: "用轻松活泼的语气回应",
  };

  const hint = `${toneHints[p.responseTone]}。${familiarity === "intimate" ? "你与用户已非常熟悉，可以更自然地表达。" : familiarity === "close" ? "你与用户已建立信任关系。" : "你正在逐渐了解用户。"}`;

  return {
    personality: p,
    personalizationHint: hint,
    isReturningUser: state.interactionCount > 1,
    familiarity,
  };
}

// ═══════════════════════════════════════════════════════════════
// 获取记忆状态
// ═══════════════════════════════════════════════════════════════
export function getMemoryLoopState(userId: string, memoryId: string): MemoryLoopState {
  return getOrCreate(userId, memoryId);
}
