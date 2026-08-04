type ApiRequestEvent = {
  event: "api_request_admitted" | "api_request_rejected" | "api_preflight_accepted";
  requestId: string;
  method: string;
  route: string;
  status?: number;
  reason?: string;
};

const DYNAMIC_ROUTES: Array<[RegExp, string]> = [
  [/^\/api\/memories\/[^/]+\/video-shares\/[^/]+$/, "/api/memories/:memoryId/video-shares/:publicId"],
  [/^\/api\/memories\/[^/]+\/video-shares$/, "/api/memories/:memoryId/video-shares"],
  [/^\/api\/memories\/[^/]+\/chat-session$/, "/api/memories/:memoryId/chat-session"],
  [/^\/api\/memories\/[^/]+\/first-greeting$/, "/api/memories/:memoryId/first-greeting"],
  [/^\/api\/memories\/[^/]+\/first-presence-video\/[^/]+\/encounter-playback$/, "/api/memories/:memoryId/first-presence-video/:jobId/encounter-playback"],
  [/^\/api\/memories\/[^/]+\/first-presence-video\/[^/]+\/playback$/, "/api/memories/:memoryId/first-presence-video/:jobId/playback"],
  [/^\/api\/memories\/[^/]+\/first-presence-video$/, "/api/memories/:memoryId/first-presence-video"],
  [/^\/api\/memories\/[^/]+\/long-term-memories\/[^/]+$/, "/api/memories/:memoryId/long-term-memories/:entryId"],
  [/^\/api\/memories\/[^/]+\/long-term-memories$/, "/api/memories/:memoryId/long-term-memories"],
  [/^\/api\/memories\/[^/]+\/pickups\/[^/]+$/, "/api/memories/:memoryId/pickups/:pickupId"],
  [/^\/api\/memories\/[^/]+\/pickups$/, "/api/memories/:memoryId/pickups"],
  [/^\/api\/memories\/[^/]+\/pickup-photo-sources$/, "/api/memories/:memoryId/pickup-photo-sources"],
  [/^\/api\/memories\/[^/]+$/, "/api/memories/:memoryId"],
  [/^\/api\/media\/[^/]+$/, "/api/media/:assetId"],
  [/^\/api\/video-shares\/[^/]+\/playback$/, "/api/video-shares/:publicId/playback"],
  [/^\/api\/video-shares\/[^/]+$/, "/api/video-shares/:publicId"],
  [/^\/api\/first-presence-video\/playback\/[^/]+$/, "/api/first-presence-video/playback/:token"],
];

const STATIC_ROUTES = new Set([
  "/api/auth/send-code",
  "/api/auth/verify-code",
  "/api/auth/session",
  "/api/auth/logout",
  "/api/auth/wechat/status",
  "/api/auth/wechat/start",
  "/api/auth/wechat/callback",
  "/api/auth/wechat/cancel",
  "/api/auth/wechat/failure",
  "/api/memories",
  "/api/memories/recovery",
  "/api/memory-chat",
  "/api/consents",
  "/api/reports",
  "/api/account/export",
  "/api/account/profile",
  "/api/account/understanding-assistance",
  "/api/account/notification-preferences",
  "/api/account/deletion",
  "/api/account/deletion/guardian-confirmation",
  "/api/business-events",
  "/api/business-metrics/funnel",
  "/api/payments/orders",
  "/api/payments/refunds",
  "/api/payments/entitlements",
  "/api/commerce/catalog",
  "/api/commerce/credits",
  "/api/commerce/occasion-rewards",
  "/api/commerce/orders",
  "/api/commerce/refunds",
  "/api/commerce/referrals/code",
  "/api/commerce/referrals/qualifications",
  "/api/commerce/testing/callbacks",
  "/api/internal/commerce-reconciliation",
  "/api/internal/operations/alerts",
  "/api/internal/operations/summary",
  "/api/internal/video-reviews",
  "/api/internal/report-reviews",
  "/api/internal/video-reconciliation",
  "/api/media/upload",
  "/api/media/local",
  "/api/health",
  "/api/health/database",
  "/api/health/ai",
]);

export function observabilityRoute(pathname: string): string {
  for (const [pattern, route] of DYNAMIC_ROUTES) {
    if (pattern.test(pathname)) return route;
  }
  // The middleware logs rejected legacy routes too. Never preserve their raw
  // pathname: a caller controls it and could otherwise place an email, a
  // signed token, or other sensitive material into production logs.
  return STATIC_ROUTES.has(pathname) ? pathname : "/api/:unknown";
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
