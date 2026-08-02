type ApiRequestEvent = {
  event: "api_request_admitted" | "api_request_rejected" | "api_preflight_accepted";
  requestId: string;
  method: string;
  route: string;
  status?: number;
  reason?: string;
};

const DYNAMIC_ROUTES: Array<[RegExp, string]> = [
  [/^\/api\/memories\/[^/]+\/chat-session$/, "/api/memories/:memoryId/chat-session"],
  [/^\/api\/memories\/[^/]+\/first-greeting$/, "/api/memories/:memoryId/first-greeting"],
  [/^\/api\/memories\/[^/]+\/first-presence-video\/[^/]+\/playback$/, "/api/memories/:memoryId/first-presence-video/:jobId/playback"],
  [/^\/api\/memories\/[^/]+\/first-presence-video$/, "/api/memories/:memoryId/first-presence-video"],
  [/^\/api\/memories\/[^/]+\/long-term-memories\/[^/]+$/, "/api/memories/:memoryId/long-term-memories/:entryId"],
  [/^\/api\/memories\/[^/]+\/long-term-memories$/, "/api/memories/:memoryId/long-term-memories"],
  [/^\/api\/memories\/[^/]+\/pickups\/[^/]+$/, "/api/memories/:memoryId/pickups/:pickupId"],
  [/^\/api\/memories\/[^/]+\/pickups$/, "/api/memories/:memoryId/pickups"],
  [/^\/api\/memories\/[^/]+$/, "/api/memories/:memoryId"],
  [/^\/api\/media\/[^/]+$/, "/api/media/:assetId"],
  [/^\/api\/first-presence-video\/playback\/[^/]+$/, "/api/first-presence-video/playback/:token"],
];

export function observabilityRoute(pathname: string): string {
  for (const [pattern, route] of DYNAMIC_ROUTES) {
    if (pattern.test(pathname)) return route;
  }
  return pathname;
}

/**
 * This must remain safe for provider URLs, signed playback tokens and user
 * content: only a route template and opaque server-generated request ID leave
 * the process. The log collector/alert configuration is deployment-owned.
 */
export function logApiRequestEvent(event: ApiRequestEvent): void {
  if (process.env.NODE_ENV !== "production") return;
  console.info(JSON.stringify(event));
}
