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
      title: "相伴",
      message: `可以查看 ${displayName} 的已确认资料，或进入聊天。`,
      disclosure: "AI生成 · 基于你确认的信息",
    };
  }

  return {
    label: "今天",
    title: "相伴",
    message: `可以从一件小事开始，或查看 ${displayName} 的已确认拾忆。`,
    disclosure: "AI生成 · 基于你确认的信息",
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
