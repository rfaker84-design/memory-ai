import { fetchOwnedMemoryListJson, OwnedMemoryRequestError, type OwnedMemoryJsonResponse } from "./ownedMemoryClient";

export class PickupIndexRequestError extends Error {
  constructor(readonly code: "PICKUP_INDEX_TIMEOUT") {
    super(code);
  }
}

/**
 * The pickup entry is read-only, but an unbounded initial request can leave a
 * user without a recovery choice. Timeout never writes or retries; it merely
 * returns control to the explicit Retry button.
 */
export async function fetchPickupIndexMemories(
  request: typeof fetch = fetch,
  parentSignal?: AbortSignal,
  timeoutMs = 12_000,
): Promise<OwnedMemoryJsonResponse> {
  try {
    return await fetchOwnedMemoryListJson(parentSignal, request, timeoutMs);
  } catch (error) {
    if (error instanceof OwnedMemoryRequestError && error.status === 408) {
      throw new PickupIndexRequestError("PICKUP_INDEX_TIMEOUT");
    }
    throw error;
  }
}
