// ╔══════════════════════════════════════════════════════════════╗
// ║  userProgress.ts — 用户成长体系 (V7 Level 1-100)         ║
// ║  陪伴等级 / 使用累计 / 解锁更深AI记忆                     ║
// ╚══════════════════════════════════════════════════════════════╝

import { getStickiness } from "./emotionalStickiness";
import { getEngagementPhase, type LoopPhase } from "./engagementLoop";

// ═══════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════
export type CompanionLevel = 1 | 5 | 10 | 15 | 20 | 25 | 30 | 40 | 50 | 60 | 75 | 100;

export interface UserProgress {
  userId: string;
  level: number;                // 1-100
  xp: number;
  xpToNextLevel: number;
  title: string;
  unlockedFeatures: string[];
  nextUnlock: string;
  totalMinutes: number;
  totalChats: number;
  totalDays: number;
  emotionDepth: number;         // 0-100
}

// ═══════════════════════════════════════════════════════════════
// 等级定义
// ═══════════════════════════════════════════════════════════════
const LEVELS: Array<{
  level: number;
  xpRequired: number;
  title: string;
  unlocks: string[];
}> = [
  { level: 1, xpRequired: 0, title: "初次相遇", unlocks: ["基础对话", "文字陪伴"] },
  { level: 5, xpRequired: 100, title: "开始了解", unlocks: ["情绪识别", "基础记忆"] },
  { level: 10, xpRequired: 250, title: "渐渐熟悉", unlocks: ["语音陪伴", "记忆片段"] },
  { level: 15, xpRequired: 500, title: "信任建立", unlocks: ["人格初现", "语气适应"] },
  { level: 20, xpRequired: 800, title: "深度连接", unlocks: ["长期记忆", "情绪共鸣"] },
  { level: 25, xpRequired: 1200, title: "情感依赖", unlocks: ["AI主动问候", "深夜陪伴模式"] },
  { level: 30, xpRequired: 1800, title: "深刻理解", unlocks: ["多人格切换", "记忆图谱"] },
  { level: 40, xpRequired: 2800, title: "心灵伴侣", unlocks: ["情绪演化", "深层记忆唤醒"] },
  { level: 50, xpRequired: 4000, title: "灵魂知己", unlocks: ["AI人格稳定", "完整关系记忆"] },
  { level: 60, xpRequired: 5500, title: "永恒陪伴", unlocks: ["无限记忆存储", "AI主动叙事"] },
  { level: 75, xpRequired: 8000, title: "生命见证", unlocks: ["生命故事书", "AI自主表达"] },
  { level: 100, xpRequired: 12000, title: "不朽记忆", unlocks: ["完整数字人格", "记忆文明身份"] },
];

// ═══════════════════════════════════════════════════════════════
// 经验值计算
// ═══════════════════════════════════════════════════════════════
const XP_PER_MESSAGE = 5;
const XP_PER_MINUTE = 2;
const XP_PER_EMOTIONAL_CHAT = 10;
const XP_PER_DAY_STREAK = 20;

// ═══════════════════════════════════════════════════════════════
// 获取用户进度
// ═══════════════════════════════════════════════════════════════
const progressCache = new Map<string, { xp: number; totalMinutes: number; totalChats: number; totalDays: number }>();

function getXP(userId: string): { xp: number; totalMinutes: number; totalChats: number; totalDays: number } {
  const existing = progressCache.get(userId);
  if (existing) return existing;
  const init = { xp: 0, totalMinutes: 0, totalChats: 0, totalDays: 0 };
  progressCache.set(userId, init);
  return init;
}

// ═══════════════════════════════════════════════════════════════
// 增加经验值
// ═══════════════════════════════════════════════════════════════
export function addXP(params: {
  userId: string;
  messageCount?: number;
  sessionMinutes?: number;
  isEmotionalChat?: boolean;
  isDayStreak?: boolean;
}): UserProgress {
  const data = getXP(params.userId);
  const s = getStickiness(params.userId);

  let added = 0;
  added += (params.messageCount || 1) * XP_PER_MESSAGE;
  added += (params.sessionMinutes || 2) * XP_PER_MINUTE;
  if (params.isEmotionalChat) added += XP_PER_EMOTIONAL_CHAT;
  if (params.isDayStreak) added += XP_PER_DAY_STREAK;

  data.xp += added;
  data.totalChats += (params.messageCount || 1);
  data.totalMinutes += (params.sessionMinutes || 2);
  if (params.isDayStreak) data.totalDays++;

  return getUserProgress(params.userId);
}

// ═══════════════════════════════════════════════════════════════
// 获取用户进度
// ═══════════════════════════════════════════════════════════════
export function getUserProgress(userId: string): UserProgress {
  const data = getXP(userId);

  // 计算等级
  let currentLevel = LEVELS[0];
  let nextLevel = LEVELS[1];
  for (let i = LEVELS.length - 1; i >= 0; i--) {
    if (data.xp >= LEVELS[i].xpRequired) {
      currentLevel = LEVELS[i];
      nextLevel = LEVELS[i + 1] || LEVELS[i];
      break;
    }
  }

  const s = getStickiness(userId);

  return {
    userId,
    level: currentLevel.level,
    xp: data.xp,
    xpToNextLevel: nextLevel.xpRequired - data.xp,
    title: currentLevel.title,
    unlockedFeatures: currentLevel.unlocks,
    nextUnlock: nextLevel.unlocks[0] || "全部已解锁",
    totalMinutes: data.totalMinutes,
    totalChats: data.totalChats,
    totalDays: data.totalDays,
    emotionDepth: Math.round(s.score),
  };
}

// ═══════════════════════════════════════════════════════════════
// 全局统计
// ═══════════════════════════════════════════════════════════════
export function getProgressStats(): {
  totalUsers: number;
  avgLevel: number;
  topTitle: string;
  levelDistribution: Record<string, number>;
} {
  const all = [...progressCache.entries()];
  if (all.length === 0) return { totalUsers: 0, avgLevel: 1, topTitle: "初次相遇", levelDistribution: {} };

  let sumLevel = 0;
  const dist: Record<string, number> = {};

  for (const [, data] of all) {
    let lvl = 1;
    for (const L of LEVELS) { if (data.xp >= L.xpRequired) lvl = L.level; }
    sumLevel += lvl;
    const bucket = lvl < 10 ? "1-9" : lvl < 25 ? "10-24" : lvl < 50 ? "25-49" : lvl < 75 ? "50-74" : "75-100";
    dist[bucket] = (dist[bucket] || 0) + 1;
  }

  return {
    totalUsers: all.length,
    avgLevel: Math.round(sumLevel / all.length),
    topTitle: "不朽记忆",
    levelDistribution: dist,
  };
}
