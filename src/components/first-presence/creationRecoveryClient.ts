import type { Memory } from "../../../features/memory/types";
import { isMemoryCreationIdempotencyKey } from "../../../features/memory/memory-idempotency";
import { createMemoryRequestHeaders } from "../create-memory/createMemoryLogic";

export const CREATION_RECOVERY_STORAGE_KEY = "memoryai:create-recovery:v1";
const CREATION_REQUEST_TIMEOUT_MS = 20_000;

export type CreationRecoveryPhase =
  | "creating"
  | "created"
  | "media-pending"
  | "photo-pending"
  | "voice-pending";

export type CreationRecoveryRecord = {
  idempotencyKey: string;
  memoryId?: string;
  phase: CreationRecoveryPhase;
};

// Public first-release creation accepts a portrait only. `voice-pending` is
// retained as a read-compatible historical recovery phase, but never creates
// an audio upload affordance or outbound upload from the public client.
export type CreationMediaKind = "photo";

export type RecoveryStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;
export type TransientCreationMedia = Partial<Record<CreationMediaKind, File>>;

const phases = new Set<CreationRecoveryPhase>([
  "creating",
  "created",
  "media-pending",
  "photo-pending",
  "voice-pending",
]);
const memoryIdPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const transientMedia = new Map<string, TransientCreationMedia>();

function defaultStorage(): RecoveryStorage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

function isRecoveryRecord(value: unknown): value is CreationRecoveryRecord {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  if (Object.keys(record).some((key) => !["idempotencyKey", "memoryId", "phase"].includes(key))) {
    return false;
  }
  if (
    typeof record.idempotencyKey !== "string"
    || !isMemoryCreationIdempotencyKey(record.idempotencyKey)
    || typeof record.phase !== "string"
    || !phases.has(record.phase as CreationRecoveryPhase)
  ) {
    return false;
  }
  if (record.memoryId !== undefined && (
    typeof record.memoryId !== "string"
    || !memoryIdPattern.test(record.memoryId)
  )) {
    return false;
  }
  return record.phase === "creating" || typeof record.memoryId === "string";
}

export function readCreationRecovery(
  storage: RecoveryStorage | null = defaultStorage(),
): CreationRecoveryRecord | null {
  if (!storage) return null;
  try {
    const raw = storage.getItem(CREATION_RECOVERY_STORAGE_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (isRecoveryRecord(parsed)) return parsed;
    storage.removeItem(CREATION_RECOVERY_STORAGE_KEY);
    return null;
  } catch {
    return null;
  }
}

export function writeCreationRecovery(
  record: CreationRecoveryRecord,
  storage: RecoveryStorage | null = defaultStorage(),
): boolean {
  if (!storage || !isRecoveryRecord(record)) return false;
  try {
    storage.setItem(CREATION_RECOVERY_STORAGE_KEY, JSON.stringify(record));
    return true;
  } catch {
    return false;
  }
}

export function clearCreationRecovery(
  storage: RecoveryStorage | null = defaultStorage(),
) : boolean {
  if (!storage) return false;
  try {
    storage.removeItem(CREATION_RECOVERY_STORAGE_KEY);
    return true;
  } catch {
    return false;
  }
}

export function mediaPhase(
  photoPending: boolean,
  unknownAfterRefresh = false,
): CreationRecoveryPhase {
  if (unknownAfterRefresh) return "media-pending";
  if (photoPending) return "photo-pending";
  return "created";
}

export function remainingMediaKinds(
  phase: CreationRecoveryPhase,
  hasPersistedPhoto: boolean,
): CreationMediaKind[] {
  if (phase === "photo-pending") return hasPersistedPhoto ? [] : ["photo"];
  if (phase === "media-pending") return hasPersistedPhoto ? [] : ["photo"];
  // A historical audio-only handoff must never re-expose public audio
  // collection. It is safely retired to the normal conversation path.
  return [];
}

export function phaseForRemainingMedia(
  remaining: Iterable<CreationMediaKind>,
): CreationRecoveryPhase {
  const kinds = new Set(remaining);
  return mediaPhase(kinds.has("photo"));
}

export function stageTransientCreationMedia(
  memoryId: string,
  files: TransientCreationMedia,
) {
  const selected: TransientCreationMedia = {
    ...(transientMedia.get(memoryId) ?? {}),
  };
  if (files.photo) selected.photo = files.photo;
  if (selected.photo) transientMedia.set(memoryId, selected);
  else transientMedia.delete(memoryId);
}

export function readTransientCreationMedia(memoryId: string): TransientCreationMedia | null {
  return transientMedia.get(memoryId) ?? null;
}

export function markTransientCreationMediaUploaded(
  memoryId: string,
  kind: CreationMediaKind,
) {
  const selected = transientMedia.get(memoryId);
  if (!selected) return;
  delete selected[kind];
  if (!selected.photo) transientMedia.delete(memoryId);
}

export function clearTransientCreationMedia(memoryId: string) {
  transientMedia.delete(memoryId);
}

export class CreationRecoveryRequestError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
  ) {
    super(code);
    this.name = "CreationRecoveryRequestError";
  }
}

/**
 * A timeout is intentionally uncertain: callers must retain the original
 * idempotency key and use the formal recovery endpoint instead of submitting
 * another creation or media request.
 */
export async function fetchCreationRequest(
  input: string,
  init: RequestInit,
  request: typeof fetch = fetch,
  parentSignal?: AbortSignal,
  timeoutMs = CREATION_REQUEST_TIMEOUT_MS,
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
    if (timedOut) throw new CreationRecoveryRequestError(408, "CREATION_REQUEST_TIMEOUT");
    throw error;
  } finally {
    globalThis.clearTimeout(timer);
    parentSignal?.removeEventListener("abort", abortFromParent);
  }
}

export async function recoverCreatedMemory(
  idempotencyKey: string,
  request: typeof fetch = fetch,
): Promise<Memory> {
  const response = await fetchCreationRequest("/api/memories/recovery", {
    method: "POST",
    credentials: "same-origin",
    cache: "no-store",
    headers: createMemoryRequestHeaders(idempotencyKey),
    body: JSON.stringify({}),
  }, request);
  const payload = await response.json().catch(() => ({})) as Record<string, unknown>;
  if (!response.ok) {
    throw new CreationRecoveryRequestError(
      response.status,
      typeof payload.error === "string" ? payload.error : "MEMORY_RECOVERY_FAILED",
    );
  }
  if (
    typeof payload.id !== "string"
    || !memoryIdPattern.test(payload.id)
    || typeof payload.name !== "string"
    || typeof payload.relationship !== "string"
  ) {
    throw new CreationRecoveryRequestError(502, "MEMORY_RECOVERY_INVALID");
  }
  return payload as unknown as Memory;
}

export async function uploadCreationMedia(
  memoryId: string,
  file: File,
  request: typeof fetch = fetch,
): Promise<{ assetId: string; mediaType: string; duplicate: boolean }> {
  const body = new FormData();
  body.append("file", file);
  body.append("memoryId", memoryId);
  const response = await fetchCreationRequest("/api/media/upload", {
    method: "POST",
    credentials: "same-origin",
    body,
  }, request);
  const payload = await response.json().catch(() => ({})) as {
    error?: unknown;
    asset?: { id?: unknown; mediaType?: unknown; status?: unknown };
    duplicate?: unknown;
  };
  if (
    !response.ok
    || typeof payload.asset?.id !== "string"
    || typeof payload.asset.mediaType !== "string"
    || payload.asset.status !== "uploaded"
  ) {
    throw new CreationRecoveryRequestError(
      response.status || 502,
      typeof payload.error === "string" ? payload.error : "MEDIA_UPLOAD_FAILED",
    );
  }
  return {
    assetId: payload.asset.id,
    mediaType: payload.asset.mediaType,
    duplicate: payload.duplicate === true,
  };
}

export class CreationMediaHandoffError extends Error {
  constructor(readonly code: "RECOVERY_WRITE_FAILED" | "MEDIA_TYPE_MISMATCH" | "RECOVERY_CLEAR_FAILED") {
    super(code);
    this.name = "CreationMediaHandoffError";
  }
}

export type ConfirmedCreationMedia = {
  kind: CreationMediaKind;
  assetId: string;
  mediaType: string;
};

export async function uploadCurrentCreationMedia(
  input: {
    memoryId: string;
    idempotencyKey: string;
    files: TransientCreationMedia;
  },
  options: {
    request?: typeof fetch;
    storage?: RecoveryStorage | null;
  } = {},
): Promise<ConfirmedCreationMedia[]> {
  const { memoryId, idempotencyKey, files } = input;
  const storage = options.storage ?? defaultStorage();
  const selected = (Object.entries(files) as Array<[CreationMediaKind, File | undefined]>)
    .filter((entry): entry is [CreationMediaKind, File] => Boolean(entry[1]));
  let pending = new Set(selected.map(([kind]) => kind));

  if (!writeCreationRecovery({
    idempotencyKey,
    memoryId,
    phase: phaseForRemainingMedia(pending),
  }, storage)) {
    throw new CreationMediaHandoffError("RECOVERY_WRITE_FAILED");
  }

  stageTransientCreationMedia(memoryId, files);
  const confirmed: ConfirmedCreationMedia[] = [];
  for (const [kind, file] of selected) {
    const uploaded = await uploadCreationMedia(memoryId, file, options.request);
    if (uploaded.mediaType !== "image") {
      throw new CreationMediaHandoffError("MEDIA_TYPE_MISMATCH");
    }
    confirmed.push({ kind, assetId: uploaded.assetId, mediaType: uploaded.mediaType });
    markTransientCreationMediaUploaded(memoryId, kind);
    pending.delete(kind);
    if (!writeCreationRecovery({
      idempotencyKey,
      memoryId,
      phase: phaseForRemainingMedia(pending),
    }, storage)) {
      throw new CreationMediaHandoffError("RECOVERY_WRITE_FAILED");
    }
  }

  if (!clearCreationRecovery(storage)) {
    throw new CreationMediaHandoffError("RECOVERY_CLEAR_FAILED");
  }
  clearTransientCreationMedia(memoryId);
  return confirmed;
}

export type PendingCreationRecoveryResult =
  | { status: "none" }
  | { status: "known"; record: CreationRecoveryRecord; memoryId: string }
  | { status: "recovered"; record: CreationRecoveryRecord; memory: Memory }
  | { status: "not-found"; record: CreationRecoveryRecord }
  | { status: "unauthenticated" };

export async function recoverPendingCreation(
  request: typeof fetch = fetch,
  storage: RecoveryStorage | null = defaultStorage(),
): Promise<PendingCreationRecoveryResult> {
  const record = readCreationRecovery(storage);
  if (!record) return { status: "none" };
  if (record.memoryId) {
    return {
      status: "known",
      record,
      memoryId: record.memoryId,
    };
  }
  try {
    const memory = await recoverCreatedMemory(record.idempotencyKey, request);
    return { status: "recovered", record, memory };
  } catch (error) {
    if (error instanceof CreationRecoveryRequestError && error.status === 401) {
      clearCreationRecovery(storage);
      return { status: "unauthenticated" };
    }
    if (error instanceof CreationRecoveryRequestError && error.status === 404) {
      return { status: "not-found", record };
    }
    throw error;
  }
}
