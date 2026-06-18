// sessionManager.ts — 多用户Session管理
// 管理userId session，绑定avatar identity，记录对话摘要

export interface UserSession {
  userId: string;
  memoryId: string;
  avatarUrl: string | null;
  personalityType: string;
  conversationSummary: string;   // 压缩后的对话摘要
  messageCount: number;
  lastActive: number;
  createdAt: number;
}

// ─── 内存存储 ───────────────────────────────────────────────
const sessions = new Map<string, UserSession>();
const MAX_SESSIONS = 10000;

function sessionKey(userId: string, memoryId: string): string {
  return userId + "::" + memoryId;
}

// ─── 获取或创建Session ──────────────────────────────────────
export function getOrCreateSession(
  userId: string,
  memoryId: string,
  avatarUrl?: string | null,
): UserSession {
  const key = sessionKey(userId, memoryId);
  const existing = sessions.get(key);

  if (existing) {
    existing.lastActive = Date.now();
    if (avatarUrl) existing.avatarUrl = avatarUrl;
    return existing;
  }

  // 淘汰旧session
  if (sessions.size >= MAX_SESSIONS) {
    let oldestKey = "";
    let oldestTime = Infinity;
    for (const [k, v] of sessions) {
      if (v.lastActive < oldestTime) { oldestTime = v.lastActive; oldestKey = k; }
    }
    if (oldestKey) sessions.delete(oldestKey);
  }

  const session: UserSession = {
    userId,
    memoryId,
    avatarUrl: avatarUrl || null,
    personalityType: "gentle",
    conversationSummary: "",
    messageCount: 0,
    lastActive: Date.now(),
    createdAt: Date.now(),
  };
  sessions.set(key, session);
  return session;
}

// ─── 更新对话摘要（压缩存储） ───────────────────────────────
export function updateSummary(
  userId: string,
  memoryId: string,
  userMsg: string,
  aiReply: string,
): void {
  const session = getOrCreateSession(userId, memoryId);
  session.messageCount++;

  // 简单摘要：保留最近交互的关键词
  const snippet = userMsg.slice(0, 30) + " → " + aiReply.slice(0, 30);
  if (session.conversationSummary) {
    const parts = session.conversationSummary.split(" | ").slice(-4);
    parts.push(snippet);
    session.conversationSummary = parts.join(" | ");
  } else {
    session.conversationSummary = snippet;
  }
}

// ─── 获取Session ────────────────────────────────────────────
export function getSession(userId: string, memoryId: string): UserSession | null {
  return sessions.get(sessionKey(userId, memoryId)) || null;
}

// ─── 统计 ───────────────────────────────────────────────────
export function getSessionStats(): { active: number; total: number } {
  const now = Date.now();
  let active = 0;
  for (const s of sessions.values()) {
    if (now - s.lastActive < 30 * 60_000) active++;
  }
  return { active, total: sessions.size };
}
