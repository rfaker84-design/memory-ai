// ╔══════════════════════════════════════════════════════════════╗
// ║  kol.ts — KOL/社区增长系统 (V7 Community Growth)          ║
// ║  社区话题 / KOL合作追踪 / 挑战活动                        ║
// ╚══════════════════════════════════════════════════════════════╝

import { createClient } from "@supabase/supabase-js";

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}

// ═══════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════
export interface KOLProfile {
  id: string;
  platform: string;
  handle: string;
  followers: number;
  partnership: "seeded" | "partner" | "ambassador";
  totalReferrals: number;
  engagement: number;
  lastActive: string;
}

export interface CommunityTopic {
  id: string;
  title: string;
  description: string;
  emotionTag: string;
  participants: number;
  contentCount: number;
  startDate: string;
  endDate: string;
}

// ═══════════════════════════════════════════════════════════════
// 社区话题库
// ═══════════════════════════════════════════════════════════════
const TOPICS: CommunityTopic[] = [
  {
    id: "topic_001",
    title: "你最想对TA说的一句话",
    description: "如果AI能替你传递一句话，你最想说什么？在评论区留下你的故事。",
    emotionTag: "nostalgic",
    participants: 0, contentCount: 0,
    startDate: new Date().toISOString(), endDate: new Date(Date.now() + 7 * 86400000).toISOString(),
  },
  {
    id: "topic_002",
    title: "记忆中最温暖的那个瞬间",
    description: "每个人心里都有一个最温暖的瞬间。用#忆见 记录下来，分享你的故事。",
    emotionTag: "warm",
    participants: 0, contentCount: 0,
    startDate: new Date().toISOString(), endDate: new Date(Date.now() + 14 * 86400000).toISOString(),
  },
  {
    id: "topic_003",
    title: "如果时光可以倒流",
    description: "如果可以回到过去，你最想改变什么？参与话题，让AI替你记住答案。",
    emotionTag: "sad",
    participants: 0, contentCount: 0,
    startDate: new Date().toISOString(), endDate: new Date(Date.now() + 7 * 86400000).toISOString(),
  },
];

// ═══════════════════════════════════════════════════════════════
// 获取社区话题
// ═══════════════════════════════════════════════════════════════
export function getCommunityTopics(): CommunityTopic[] {
  return TOPICS.filter(t => new Date(t.endDate) > new Date());
}

// ═══════════════════════════════════════════════════════════════
// 话题参与追踪
// ═══════════════════════════════════════════════════════════════
export function participateInTopic(topicId: string): void {
  const topic = TOPICS.find(t => t.id === topicId);
  if (topic) {
    topic.participants++;
    topic.contentCount++;
  }
}

// ═══════════════════════════════════════════════════════════════
// KOL 追踪
// ═══════════════════════════════════════════════════════════════
const kolCache = new Map<string, KOLProfile>();

export async function trackKOLReferral(
  kolId: string,
  newUserId: string,
): Promise<void> {
  const profile = kolCache.get(kolId) || {
    id: kolId,
    platform: "unknown",
    handle: kolId,
    followers: 0,
    partnership: "seeded" as const,
    totalReferrals: 0,
    engagement: 0,
    lastActive: new Date().toISOString(),
  };

  profile.totalReferrals++;
  profile.lastActive = new Date().toISOString();
  kolCache.set(kolId, profile);
}

export function getKOLLeaderboard(limit = 20): KOLProfile[] {
  return [...kolCache.values()]
    .sort((a, b) => b.totalReferrals - a.totalReferrals)
    .slice(0, limit);
}

// ═══════════════════════════════════════════════════════════════
// 挑战活动
// ═══════════════════════════════════════════════════════════════
export interface Challenge {
  id: string;
  title: string;
  description: string;
  reward: string;
  goal: number;
  progress: number;
  endDate: string;
}

export function getActiveChallenges(): Challenge[] {
  return [
    {
      id: "ch_001",
      title: "7天记忆打卡挑战",
      description: "连续7天与AI对话，解锁专属记忆报告",
      reward: "3天Pro会员",
      goal: 7,
      progress: 0,
      endDate: new Date(Date.now() + 30 * 86400000).toISOString(),
    },
    {
      id: "ch_002",
      title: "邀请3人·解锁高清语音",
      description: "邀请3位好友加入#忆见，解锁无限TTS额度",
      reward: "30天高清语音",
      goal: 3,
      progress: 0,
      endDate: new Date(Date.now() + 14 * 86400000).toISOString(),
    },
  ];
}
