// ╔══════════════════════════════════════════════════════════════╗
// ║  growth.ts — 用户增长系统 (V6 Growth Engine)              ║
// ║  来源追踪 / 渠道统计 / 激活率 / CAC vs LTV                 ║
// ╚══════════════════════════════════════════════════════════════╝

import { createClient } from "@supabase/supabase-js";
import { getStickiness as getStickinessES } from "./emotionalStickiness";

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}

// ═══════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════
export type GrowthChannel = "organic" | "referral" | "social" | "search" | "ad" | "direct";

export interface GrowthEvent {
  userId: string;
  event: string;
  channel: GrowthChannel;
  referrerId?: string;
  timestamp: string;
  metadata?: Record<string, unknown>;
}

export interface ChannelMetrics {
  channel: GrowthChannel;
  totalUsers: number;
  activeUsers: number;
  conversionRate: number;     // 免费→付费
  avgLtv: number;
  costPerAcquisition: number;
}

export interface GrowthMetrics {
  dau: number;
  wau: number;
  mau: number;
  newUsersToday: number;
  activationRate: number;
  retentionD1: number;
  retentionD7: number;
  retentionD30: number;
  channels: ChannelMetrics[];
}

// ═══════════════════════════════════════════════════════════════
// 事件追踪（内存缓冲 + 定时刷新 Supabase）
// ═══════════════════════════════════════════════════════════════
const eventBuffer: GrowthEvent[] = [];
const FLUSH_INTERVAL = 30_000; // 30s
let lastFlush = 0;

export function trackGrowthEvent(
  userId: string,
  event: string,
  channel: GrowthChannel = "organic",
  referrerId?: string,
  metadata?: Record<string, unknown>,
): void {
  eventBuffer.push({
    userId, event, channel, referrerId,
    timestamp: new Date().toISOString(),
    metadata,
  });

  // 批量刷新
  if (Date.now() - lastFlush > FLUSH_INTERVAL) {
    flushEvents();
  }
}

async function flushEvents(): Promise<void> {
  if (eventBuffer.length === 0) return;
  lastFlush = Date.now();

  const batch = eventBuffer.splice(0, eventBuffer.length);
  const supabase = getSupabase();

  try {
    await supabase.from("growth_events").insert(
      batch.map(e => ({
        user_id: e.userId,
        event: e.event,
        channel: e.channel,
        referrer_id: e.referrerId || null,
        timestamp: e.timestamp,
        metadata: e.metadata || {},
      })),
    );
  } catch {
    // 非致命 - 事件丢失可接受
  }
}

// ═══════════════════════════════════════════════════════════════
// 渠道统计
// ═══════════════════════════════════════════════════════════════
export async function getChannelMetrics(): Promise<ChannelMetrics[]> {
  const supabase = getSupabase();
  const channels: GrowthChannel[] = ["organic", "referral", "social", "search", "ad", "direct"];

  const results: ChannelMetrics[] = [];

  for (const channel of channels) {
    const { count: totalUsers } = await supabase
      .from("growth_events")
      .select("*", { count: "exact", head: true })
      .eq("channel", channel)
      .eq("event", "signup");

    const { count: activeUsers } = await supabase
      .from("growth_events")
      .select("*", { count: "exact", head: true })
      .eq("channel", channel)
      .eq("event", "chat")
      .gte("timestamp", new Date(Date.now() - 7 * 86400000).toISOString());

    const { count: paying } = await supabase
      .from("growth_events")
      .select("*", { count: "exact", head: true })
      .eq("channel", channel)
      .eq("event", "subscription");

    results.push({
      channel,
      totalUsers: totalUsers || 0,
      activeUsers: activeUsers || 0,
      conversionRate: totalUsers ? ((paying || 0) / totalUsers) * 100 : 0,
      avgLtv: 0,
      costPerAcquisition: channel === "ad" ? 5 : 0,
    });
  }

  return results;
}

// ═══════════════════════════════════════════════════════════════
// 增长指标
// ═══════════════════════════════════════════════════════════════
export async function getGrowthMetrics(): Promise<GrowthMetrics> {
  const supabase = getSupabase();
  const today = new Date().toISOString().slice(0, 10);
  const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString();
  const monthAgo = new Date(Date.now() - 30 * 86400000).toISOString();

  const { count: dau } = await supabase
    .from("growth_events")
    .select("user_id", { count: "exact", head: true })
    .eq("event", "chat")
    .gte("timestamp", today);

  const { count: wau } = await supabase
    .from("growth_events")
    .select("user_id", { count: "exact", head: true })
    .eq("event", "chat")
    .gte("timestamp", weekAgo);

  const { count: mau } = await supabase
    .from("growth_events")
    .select("user_id", { count: "exact", head: true })
    .eq("event", "chat")
    .gte("timestamp", monthAgo);

  const { count: newToday } = await supabase
    .from("growth_events")
    .select("*", { count: "exact", head: true })
    .eq("event", "signup")
    .gte("timestamp", today);

  return {
    dau: dau || 0,
    wau: wau || 0,
    mau: mau || 0,
    newUsersToday: newToday || 0,
    activationRate: 0,
    retentionD1: 0,
    retentionD7: 0,
    retentionD30: 0,
    channels: await getChannelMetrics(),
  };
}

// ═══════════════════════════════════════════════════════════════
// 用户激活判定
// ═══════════════════════════════════════════════════════════════
export function isUserActivated(
  chatCount: number,
  daysSinceSignup: number,
): boolean {
  // 激活标准：注册7天内对话 >= 5次
  return daysSinceSignup <= 7 && chatCount >= 5;
}

// ═══════════════════════════════════════════════════════════════
// 兼容旧版本 API（stub）
// ═══════════════════════════════════════════════════════════════
export function logBehavior(userId: string, action: string, metadata?: Record<string, unknown>): void {
  trackGrowthEvent(userId, action, "organic", undefined, metadata);
}

export function updateConversionScore(userId: string, score: number): void {
  trackGrowthEvent(userId, "conversion_update", "organic", undefined, { score });
}

export function getReturnInterval(userId: string): number {
  // 基于依赖度返回建议回访间隔（小时）
  
  const hour = new Date().getHours();
  if (hour >= 22 || hour < 6) return 12;
  return 24;



}
