import type { Memory } from "../../../features/memory/types";

export class OwnedMemoryRequestError extends Error {
  constructor(
    readonly status: number,
    readonly code: string
  ) {
    super(code);
  }
}

/**
 * AUTH_MIGRATION_REQUIRED
 *
 * This localStorage value is only a compatibility identity input. It is not a
 * secure session and must be replaced by the formal auth layer.
 */
export function temporaryMemoryOwnerId(): string | null {
  if (typeof window === "undefined") return null;
  return (
    window.localStorage.getItem("yijian_phone") ||
    window.localStorage.getItem("yj_phone") ||
    null
  );
}

export async function loadOwnedMemory(
  memoryId: string,
  userId: string,
  signal?: AbortSignal,
  request: typeof fetch = fetch
): Promise<Memory> {
  const response = await request(
    `/api/memories/${encodeURIComponent(memoryId)}?userId=${encodeURIComponent(userId)}`,
    { cache: "no-store", signal }
  );
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new OwnedMemoryRequestError(
      response.status,
      typeof body.error === "string" ? body.error : "MEMORY_READ_FAILED"
    );
  }
  return body as Memory;
}
