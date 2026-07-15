import type { Memory } from "../../../features/memory/types";

export class OwnedMemoryRequestError extends Error {
  constructor(
    readonly status: number,
    readonly code: string
  ) {
    super(code);
  }
}

export async function loadOwnedMemory(
  memoryId: string,
  signal?: AbortSignal,
  request: typeof fetch = fetch
): Promise<Memory> {
  const response = await request(
    `/api/memories/${encodeURIComponent(memoryId)}`,
    { cache: "no-store", credentials: "same-origin", signal }
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
