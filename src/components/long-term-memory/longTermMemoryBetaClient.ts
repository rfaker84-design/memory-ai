import type { LongTermMemory } from "@/features/long-term-memory";

export class LongTermMemoryBetaRequestError extends Error {
  constructor(
    readonly status: number,
    readonly code: string
  ) {
    super(code);
  }
}

async function responseBody(response: Response): Promise<Record<string, unknown>> {
  return response.json().catch(() => ({})) as Promise<Record<string, unknown>>;
}

function requestError(response: Response, body: Record<string, unknown>) {
  return new LongTermMemoryBetaRequestError(
    response.status,
    typeof body.error === "string" ? body.error : "LONG_TERM_MEMORY_REQUEST_FAILED"
  );
}

export async function listLongTermMemories(
  memoryId: string,
  signal?: AbortSignal,
  request: typeof fetch = fetch
): Promise<LongTermMemory[]> {
  const response = await request(
    `/api/memories/${encodeURIComponent(memoryId)}/long-term-memories`,
    { cache: "no-store", credentials: "same-origin", signal }
  );
  const body = await responseBody(response);
  if (!response.ok) throw requestError(response, body);
  return Array.isArray(body.memories) ? (body.memories as LongTermMemory[]) : [];
}

export async function correctLongTermMemory(
  memoryId: string,
  longTermMemoryId: string,
  content: string,
  request: typeof fetch = fetch
): Promise<LongTermMemory> {
  const response = await request(
    `/api/memories/${encodeURIComponent(memoryId)}/long-term-memories/${encodeURIComponent(longTermMemoryId)}`,
    {
      method: "PATCH",
      credentials: "same-origin",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ content }),
    }
  );
  const body = await responseBody(response);
  if (!response.ok) throw requestError(response, body);
  if (!body.memory || typeof body.memory !== "object") {
    throw new LongTermMemoryBetaRequestError(502, "INVALID_LONG_TERM_MEMORY_RESPONSE");
  }
  return body.memory as LongTermMemory;
}

export async function deleteLongTermMemory(
  memoryId: string,
  longTermMemoryId: string,
  request: typeof fetch = fetch
): Promise<void> {
  const response = await request(
    `/api/memories/${encodeURIComponent(memoryId)}/long-term-memories/${encodeURIComponent(longTermMemoryId)}`,
    {
      method: "DELETE",
      credentials: "same-origin",
    }
  );
  if (!response.ok) {
    throw requestError(response, await responseBody(response));
  }
}
