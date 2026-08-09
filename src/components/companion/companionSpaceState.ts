export type CompanionGreeting = {
  label: string;
  title: string;
  message: string;
  disclosure: string;
};

export type CompanionVisitState = "first_visit" | "daily_visit";

export const COMPANION_VISIT_MARKER = "visited-v1";
const COMPANION_VISIT_KEY_PREFIX = "memoryai.companion.visit.";

export function companionVisitStorageKey(memoryId: string): string {
  return `${COMPANION_VISIT_KEY_PREFIX}${encodeURIComponent(memoryId)}`;
}

export function resolveCompanionVisitState(marker: string | null): CompanionVisitState {
  return marker === COMPANION_VISIT_MARKER ? "daily_visit" : "first_visit";
}

/**
 * The first companion-space greeting is presentation copy, not a recovered
 * quote or a claim that the represented person is presently speaking. It uses
 * only the Owner-confirmed display name and remains explicit about its origin.
 */
export function companionVisitGreeting(
  name: string,
  visit: CompanionVisitState,
): CompanionGreeting {
  const displayName = name.trim() || "这位 TA";
  if (visit === "first_visit") {
    return {
      label: "第一次来到相伴",
      title: "欢迎回来",
      message: `先不用急着说什么。你可以在这里看看 ${displayName}，再决定今天想做什么。`,
      disclosure: "AI 生成内容 · 基于用户确认资料 · 不代表 TA 的真实历史留言或表达",
    };
  }

  return {
    label: "今天",
    title: "今天过得怎么样？",
    message: `如果愿意，可以从一件小事说起，也可以只是看看 ${displayName} 的已确认拾忆。`,
    disclosure: "AI 生成内容 · 基于用户确认资料 · 不代表 TA 的真实历史留言或表达",
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
