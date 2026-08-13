export const COMPANION_MOTION_VARIANTS = ["idle", "attentive", "reflective"] as const;

export type CompanionMotionVariant = (typeof COMPANION_MOTION_VARIANTS)[number];

export type CompanionMotionSlot = {
  variant: CompanionMotionVariant;
  status: string;
  jobId: string;
  artifactAvailable: boolean;
};

export type CompanionMotionPack = {
  eligible: boolean;
  slots: CompanionMotionSlot[];
};

export type CompanionMotionPlayback = {
  url: string;
  expiresAt: string;
};

type FetchLike = typeof fetch;

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const VARIANTS = new Set<string>(COMPANION_MOTION_VARIANTS);
const STATUSES = new Set([
  "queued",
  "submitting",
  "submission_uncertain",
  "submitted",
  "running",
  "quality_pending",
  "manual_review_required",
  "succeeded",
  "rejected",
  "failed",
]);
const TERMINAL_STATUSES = new Set(["succeeded", "rejected", "failed", "submission_uncertain"]);
const COMPANION_MOTION_REQUEST_TIMEOUT_MS = 12_000;
const PLAYBACK_PATH_PATTERN = /^\/api\/first-presence-video\/playback\/[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/;
const ensureRequests = new Map<string, Promise<CompanionMotionPack>>();

export class CompanionMotionRequestError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
    this.name = "CompanionMotionRequestError";
  }
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function normalizeSlot(value: unknown): CompanionMotionSlot | null {
  const slot = record(value);
  if (
    typeof slot.variant !== "string"
    || !VARIANTS.has(slot.variant)
    || typeof slot.status !== "string"
    || !STATUSES.has(slot.status)
    || typeof slot.artifactAvailable !== "boolean"
  ) return null;
  const jobId = typeof slot.jobId === "string" && UUID_PATTERN.test(slot.jobId)
    ? slot.jobId.toLowerCase()
    : null;
  if (!jobId || (slot.artifactAvailable && slot.status !== "succeeded")) return null;
  return {
    variant: slot.variant as CompanionMotionVariant,
    status: slot.status,
    jobId,
    artifactAvailable: slot.artifactAvailable,
  };
}

export function normalizeCompanionMotionPack(value: unknown): CompanionMotionPack | null {
  const body = record(value);
  if (typeof body.eligible !== "boolean" || !Array.isArray(body.slots)) return null;
  const normalized = body.slots.map(normalizeSlot);
  if (normalized.some((slot) => slot === null)) return null;
  const slots = normalized as CompanionMotionSlot[];
  const distinct = new Map<CompanionMotionVariant, CompanionMotionSlot>();
  for (const slot of slots) {
    if (distinct.has(slot.variant)) return null;
    distinct.set(slot.variant, slot);
  }
  if (!body.eligible && slots.length > 0) return null;
  return { eligible: body.eligible, slots: [...distinct.values()] };
}

async function boundedJson(
  request: FetchLike,
  input: string,
  init: RequestInit,
  parentSignal?: AbortSignal,
  timeoutMs = COMPANION_MOTION_REQUEST_TIMEOUT_MS,
): Promise<{ response: Response; body: unknown }> {
  const controller = new AbortController();
  let timedOut = false;
  const abort = () => controller.abort();
  if (parentSignal?.aborted) controller.abort();
  else parentSignal?.addEventListener("abort", abort, { once: true });
  const timer = globalThis.setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);
  try {
    const response = await request(input, { ...init, signal: controller.signal });
    const body = await response.json().catch(() => null) as unknown;
    return { response, body };
  } catch (error) {
    if (timedOut) throw new CompanionMotionRequestError(408, "COMPANION_MOTION_TIMEOUT");
    throw error;
  } finally {
    globalThis.clearTimeout(timer);
    parentSignal?.removeEventListener("abort", abort);
  }
}

async function motionPackRequest(
  memoryId: string,
  method: "GET" | "POST",
  signal?: AbortSignal,
  request: FetchLike = fetch,
): Promise<CompanionMotionPack> {
  const { response, body } = await boundedJson(
    request,
    `/api/memories/${encodeURIComponent(memoryId)}/companion-motion`,
    {
      method,
      credentials: "same-origin",
      cache: "no-store",
      ...(method === "POST"
        ? { headers: { "content-type": "application/json" }, body: JSON.stringify({}) }
        : {}),
    },
    signal,
  );
  if (!response.ok) throw new CompanionMotionRequestError(response.status, "COMPANION_MOTION_UNAVAILABLE");
  const pack = normalizeCompanionMotionPack(body);
  if (!pack) throw new CompanionMotionRequestError(502, "COMPANION_MOTION_INVALID");
  return pack;
}

export function loadCompanionMotionPack(
  memoryId: string,
  signal?: AbortSignal,
  request: FetchLike = fetch,
): Promise<CompanionMotionPack> {
  return motionPackRequest(memoryId, "GET", signal, request);
}

export function ensureCompanionMotionPack(
  memoryId: string,
  signal?: AbortSignal,
  request: FetchLike = fetch,
): Promise<CompanionMotionPack> {
  return motionPackRequest(memoryId, "POST", signal, request);
}

/**
 * React development remounts and fast Companion -> Chat navigation must not
 * turn one missing pack into parallel POST requests. The server remains the
 * source of truth; this cache only coalesces one accepted ensure per page life.
 */
export function ensureCompanionMotionPackOnce(
  memoryId: string,
  request: FetchLike = fetch,
): Promise<CompanionMotionPack> {
  const key = memoryId.trim().toLowerCase();
  const current = ensureRequests.get(key);
  if (current) return current;
  const created = ensureCompanionMotionPack(memoryId, undefined, request);
  ensureRequests.set(key, created);
  void created.catch(() => {
    if (ensureRequests.get(key) === created) ensureRequests.delete(key);
  });
  return created;
}

export async function authorizeCompanionMotionPlayback(
  memoryId: string,
  jobId: string,
  signal?: AbortSignal,
  request: FetchLike = fetch,
): Promise<CompanionMotionPlayback> {
  const { response, body } = await boundedJson(
    request,
    `/api/memories/${encodeURIComponent(memoryId)}/first-presence-video/${encodeURIComponent(jobId)}/playback`,
    { method: "GET", credentials: "same-origin", cache: "no-store" },
    signal,
  );
  if (!response.ok) throw new CompanionMotionRequestError(response.status, "COMPANION_MOTION_PLAYBACK_UNAVAILABLE");
  const playback = record(record(body).playback);
  const expiresAt = typeof playback.expiresAt === "string" ? playback.expiresAt : "";
  const expiresAtMs = Date.parse(expiresAt);
  if (
    typeof playback.url !== "string"
    || !PLAYBACK_PATH_PATTERN.test(playback.url)
    || !Number.isFinite(expiresAtMs)
    || expiresAtMs <= Date.now()
  ) throw new CompanionMotionRequestError(502, "COMPANION_MOTION_PLAYBACK_INVALID");
  // The protected source stays untouched.  The endpoint selects a cached,
  // smaller 720px delivery rendition when one exists and safely falls back to
  // the reviewed source while that local cache is being prepared.
  return { url: `${playback.url}?rendition=mobile`, expiresAt: new Date(expiresAtMs).toISOString() };
}

export function companionMotionPackReady(pack: CompanionMotionPack): boolean {
  return COMPANION_MOTION_VARIANTS.every((variant) => pack.slots.some((slot) => (
    slot.variant === variant && slot.artifactAvailable
  )));
}

export function companionMotionPackNeedsEnsure(pack: CompanionMotionPack): boolean {
  if (!pack.eligible) return false;
  const variants = new Set(pack.slots.map((slot) => slot.variant));
  return COMPANION_MOTION_VARIANTS.some((variant) => !variants.has(variant));
}

export function companionMotionPackNeedsPolling(pack: CompanionMotionPack): boolean {
  return pack.eligible
    && pack.slots.some((slot) => !slot.artifactAvailable && !TERMINAL_STATUSES.has(slot.status));
}
