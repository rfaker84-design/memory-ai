import { fetchCompanionHomeMemoriesJson } from "../companion/companionHomeRequest";

export type PostLoginDestination = "/create-memory" | "/memory-world";

export class PostLoginDestinationError extends Error {
  constructor(readonly code: "POST_LOGIN_SESSION_LOST" | "POST_LOGIN_OWNER_READ_FAILED") {
    super(code);
  }
}

/**
 * Route only from the formal Owner-scoped memory list. Returning Owners go
 * straight to their TA; genuinely empty Owners enter the single Sprint23
 * creator. A missing Session never falls back to client-side draft state.
 */
export async function resolvePostLoginDestination(
  request: typeof fetch = fetch,
  signal?: AbortSignal,
): Promise<PostLoginDestination> {
  const { response, body } = await fetchCompanionHomeMemoriesJson(request, signal);
  if (response.status === 401) {
    throw new PostLoginDestinationError("POST_LOGIN_SESSION_LOST");
  }
  if (!response.ok || !Array.isArray(body)) {
    throw new PostLoginDestinationError("POST_LOGIN_OWNER_READ_FAILED");
  }
  return body.length > 0 ? "/memory-world" : "/create-memory";
}
