export type CompanionGreeting = {
  title: string;
  message: string;
  disclosure: string;
};

/**
 * The first companion-space greeting is presentation copy, not a recovered
 * quote or a claim that the represented person is presently speaking. It uses
 * only the Owner-confirmed display name and remains explicit about its origin.
 */
export function companionFirstGreeting(name: string): CompanionGreeting {
  const displayName = name.trim() || "这位 TA";
  return {
    title: `${displayName}的第一声问候`,
    message: "最近还好吗？如果你愿意，可以从今天的一件小事说起。",
    disclosure: "AI 生成演示 · 基于你确认的称呼和关系，不代表 TA 的真实历史留言。",
  };
}

export function companionRelationship(relationship: string | null | undefined): string {
  const confirmed = relationship?.trim();
  return confirmed || "一位对你很重要的人";
}

/** The existing generator is intentionally reached through formal chat. */
export function companionVideoEntry(memoryId: string): string {
  return `/memory-chat/${encodeURIComponent(memoryId)}`;
}
