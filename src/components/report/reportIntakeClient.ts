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
const REQUEST_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type ReportJsonResponse = { response: Response; body: unknown };

/** Only display a server-generated opaque correlation ID. Never reflect an
 * arbitrary response header into a sensitive support surface. */
export function reportRequestId(response: Pick<Response, "headers">): string | null {
  const value = response.headers.get("x-request-id")?.trim();
  return value && REQUEST_ID_PATTERN.test(value) ? value.toLowerCase() : null;
}

type ReportResponseReader<T> = (response: Response, signal: AbortSignal) => Promise<T>;

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
async function fetchReport<T = Response>(
  input: string,
  init: RequestInit,
  request: typeof fetch = fetch,
  parentSignal?: AbortSignal,
  timeoutMs = REPORT_REQUEST_TIMEOUT_MS,
  readResponse?: ReportResponseReader<T>,
): Promise<T> {
  const controller = new AbortController();
  let timedOut = false;
  const abortFromParent = () => controller.abort();
  if (parentSignal?.aborted) controller.abort();
  else parentSignal?.addEventListener("abort", abortFromParent, { once: true });
  const timer = globalThis.setTimeout(() => { timedOut = true; controller.abort(); }, timeoutMs);
  try {
    const response = await request(input, { ...init, signal: controller.signal });
    return readResponse ? await readResponse(response, controller.signal) : response as T;
  } catch (error) {
    if (timedOut) throw new ReportRequestError("REPORT_REQUEST_TIMEOUT");
    throw error;
  } finally {
    globalThis.clearTimeout(timer);
    parentSignal?.removeEventListener("abort", abortFromParent);
  }
}

async function readReportJson(response: Response, signal: AbortSignal): Promise<ReportJsonResponse> {
  try {
    return { response, body: await response.json() };
  } catch (error) {
    if (signal.aborted) throw error;
    return { response, body: {} };
  }
}

export function fetchReportRequest(
  input: string,
  init: RequestInit,
  request: typeof fetch = fetch,
  parentSignal?: AbortSignal,
  timeoutMs = REPORT_REQUEST_TIMEOUT_MS,
): Promise<Response> {
  return fetchReport(input, init, request, parentSignal, timeoutMs);
}

/**
 * Keeps the timeout active while parsing a report response.  The UI can then
 * preserve the same in-memory idempotency key after an uncertain POST instead
 * of hanging or issuing an implicit duplicate submission.
 */
export function fetchReportJson(
  input: string,
  init: RequestInit,
  request: typeof fetch = fetch,
  parentSignal?: AbortSignal,
  timeoutMs = REPORT_REQUEST_TIMEOUT_MS,
): Promise<ReportJsonResponse> {
  return fetchReport(input, init, request, parentSignal, timeoutMs, readReportJson);
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
