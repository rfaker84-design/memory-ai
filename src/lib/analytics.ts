// ╔══════════════════════════════════════════════════════════════╗
// ║  analytics.ts — 数据分析系统 (V6 Analytics Engine)        ║
// ║  事件采集 / 漏斗分析 / 留存 / 行为路径                     ║
// ╚══════════════════════════════════════════════════════════════╝

// ═══════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════
export type AnalyticsEvent =
  | "page_view"
  | "memory_create"
  | "memory_open"
  | "chat_start"
  | "chat_message"
  | "tts_play"
  | "avatar_view"
  | "subscription_view"
  | "payment_start"
  | "payment_complete"
  | "share_click"
  | "referral_used";

export interface AnalyticsRecord {
  userId: string;
  event: AnalyticsEvent;
  timestamp: string;
  sessionId: string;
  duration?: number;
  metadata?: Record<string, unknown>;
}

export interface FunnelStep {
  step: string;
  users: number;
  conversion: number;     // 转化率（相对前一步）
  dropoff: number;        // 流失率
}

export interface RetentionCohort {
  day: number;
  users: number;
  rate: number;
}

// ═══════════════════════════════════════════════════════════════
// 事件缓冲（批量写入）
// ═══════════════════════════════════════════════════════════════
const eventBuffer: AnalyticsRecord[] = [];
const MAX_BUFFER = 100;
const FLUSH_MS = 30_000;
let lastFlushTime = 0;

export function trackAnalytics(
  userId: string,
  event: AnalyticsEvent,
  metadata?: Record<string, unknown>,
  duration?: number,
): void {
  eventBuffer.push({
    userId,
    event,
    timestamp: new Date().toISOString(),
    sessionId: userId + "_" + new Date().toISOString().slice(0, 10),
    duration,
    metadata,
  });

  if (eventBuffer.length >= MAX_BUFFER || Date.now() - lastFlushTime > FLUSH_MS) {
    flushAnalytics();
  }
}

function flushAnalytics(): void {
  lastFlushTime = Date.now();
  // 生产环境写入 Supabase analytics_events 表
  // 开发环境静默丢弃
  eventBuffer.length = 0;
}

// ═══════════════════════════════════════════════════════════════
// 漏斗分析
// ═══════════════════════════════════════════════════════════════
export function getConversionFunnel(events: AnalyticsRecord[]): FunnelStep[] {
  const funnel: FunnelStep[] = [
    { step: "page_view", users: 0, conversion: 100, dropoff: 0 },
    { step: "memory_create", users: 0, conversion: 0, dropoff: 0 },
    { step: "chat_start", users: 0, conversion: 0, dropoff: 0 },
    { step: "subscription_view", users: 0, conversion: 0, dropoff: 0 },
    { step: "payment_start", users: 0, conversion: 0, dropoff: 0 },
    { step: "payment_complete", users: 0, conversion: 0, dropoff: 0 },
  ];

  const uniqueUsers = new Map<string, Set<string>>();
  for (const step of funnel) {
    uniqueUsers.set(step.step, new Set());
  }

  for (const event of events) {
    const users = uniqueUsers.get(event.event);
    if (users) users.add(event.userId);
  }

  for (let i = 0; i < funnel.length; i++) {
    const users = uniqueUsers.get(funnel[i].step);
    funnel[i].users = users?.size || 0;
    if (i > 0) {
      const prevUsers = funnel[i - 1].users || 1;
      funnel[i].conversion = Math.round((funnel[i].users / prevUsers) * 100);
      funnel[i].dropoff = 100 - funnel[i].conversion;
    }
  }

  return funnel;
}

// ═══════════════════════════════════════════════════════════════
// 事件统计摘要
// ═══════════════════════════════════════════════════════════════
export function getAnalyticsSummary(events: AnalyticsRecord[]): {
  totalEvents: number;
  uniqueUsers: number;
  byEvent: Record<string, number>;
  todayEvents: number;
  avgEventsPerUser: number;
} {
  const today = new Date().toISOString().slice(0, 10);
  const userSet = new Set<string>();
  const byEvent: Record<string, number> = {};
  let todayCount = 0;

  for (const e of events) {
    userSet.add(e.userId);
    byEvent[e.event] = (byEvent[e.event] || 0) + 1;
    if (e.timestamp.startsWith(today)) todayCount++;
  }

  return {
    totalEvents: events.length,
    uniqueUsers: userSet.size,
    byEvent,
    todayEvents: todayCount,
    avgEventsPerUser: userSet.size > 0 ? Math.round(events.length / userSet.size) : 0,
  };
}

// ═══════════════════════════════════════════════════════════════
// 事件缓存读取（管理面板用）
// ═══════════════════════════════════════════════════════════════
export function getRecentAnalytics(limit = 200): AnalyticsRecord[] {
  return [...eventBuffer].slice(-limit).reverse();
}
