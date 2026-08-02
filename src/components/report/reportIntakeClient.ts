export type ReportDraft = {
  category: string;
  requestedAction: string;
  details: string;
};

export type PendingReportSubmission = {
  draft: ReportDraft;
  idempotencyKey: string;
};

const REPORT_REQUEST_TIMEOUT_MS = 12_000;

export class ReportRequestError extends Error {
  constructor(readonly code: "REPORT_REQUEST_TIMEOUT") {
    super(code);
    this.name = "ReportRequestError";
  }
}

/**
 * A report may contain sensitive text, so a timeout only releases the UI for
 * an explicit same-draft retry. It never persists the draft or starts a new
 * submission behind the user's back.
 */
export async function fetchReportRequest(
  input: string,
  init: RequestInit,
  request: typeof fetch = fetch,
  parentSignal?: AbortSignal,
  timeoutMs = REPORT_REQUEST_TIMEOUT_MS,
): Promise<Response> {
  const controller = new AbortController();
  let timedOut = false;
  const abortFromParent = () => controller.abort();
  if (parentSignal?.aborted) controller.abort();
  else parentSignal?.addEventListener("abort", abortFromParent, { once: true });
  const timer = globalThis.setTimeout(() => { timedOut = true; controller.abort(); }, timeoutMs);
  try {
    return await request(input, { ...init, signal: controller.signal });
  } catch (error) {
    if (timedOut) throw new ReportRequestError("REPORT_REQUEST_TIMEOUT");
    throw error;
  } finally {
    globalThis.clearTimeout(timer);
    parentSignal?.removeEventListener("abort", abortFromParent);
  }
}

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
