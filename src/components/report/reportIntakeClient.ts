export type ReportDraft = {
  category: string;
  requestedAction: string;
  details: string;
};

export type PendingReportSubmission = {
  draft: ReportDraft;
  idempotencyKey: string;
};

function sameDraft(left: ReportDraft, right: ReportDraft): boolean {
  return left.category === right.category
    && left.requestedAction === right.requestedAction
    && left.details === right.details;
}

export function createReportIdempotencyKey(): string {
  const random = typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `report-${random}`;
}

/**
 * The report text may be sensitive, so recovery intentionally remains only in
 * the mounted component.  A response loss can safely retry the same draft and
 * key, but a refresh never persists the complaint text to browser storage.
 */
export function prepareReportSubmission(
  previous: PendingReportSubmission | null,
  draft: ReportDraft,
  createKey: () => string = createReportIdempotencyKey,
): PendingReportSubmission {
  if (previous && sameDraft(previous.draft, draft)) return previous;
  return { draft: { ...draft }, idempotencyKey: createKey() };
}
