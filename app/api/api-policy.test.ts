import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";

import { NextRequest } from "next/server";

import { isFormalApiPath, middleware } from "@/middleware";
import { sourceAuditRouteFiles } from "@/scripts/security/source-audit-files";

process.env.AUTH_ALLOWED_ORIGIN = "https://memoryai.test";

const EXACT_FORMAL_PATHS = new Set([
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

const P0_PATHS = new Set([
  "/api/payment/callback",
  "/api/payment/create-order",
  "/api/payment/trigger",
  "/api/subscription/status",
  "/api/avatar-callback",
  "/api/voice-clone-callback",
  "/api/avatar-provider",
  "/api/start-avatar-generation",
  "/api/start-voice-training",
  "/api/upload",
  "/api/upload-voice",
  "/api/voice-clone",
  "/api/jobs",
  "/api/jobs/[id]",
  "/api/share/generate",
  "/api/project-state",
]);

const METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE"] as const;

function trackedRoutes(): Array<{ file: string; pathname: string }> {
  return sourceAuditRouteFiles()
    .map((file) => ({
      file,
      pathname: `/${file.replace(/\\/g, "/").replace(/^app\//, "").replace(/\/route\.ts$/, "")}`,
    }));
}

function assertNoStore(response: Response): void {
  assert.equal(response.headers.get("cache-control"), "private, no-store, max-age=0");
  assert.equal(response.headers.get("pragma"), "no-cache");
  assert.equal(response.headers.get("vary"), "Cookie, Origin");
}

test("middleware enforces the formal API allowlist before route execution", async () => {
  for (const pathname of EXACT_FORMAL_PATHS) assert.equal(isFormalApiPath(pathname), true, pathname);
  assert.equal(isFormalApiPath("/api/memories/00000000-0000-4000-8000-000000000001"), true);
  assert.equal(isFormalApiPath("/api/memories/00000000-0000-4000-8000-000000000001/first-greeting"), true);
  assert.equal(isFormalApiPath("/api/memories/00000000-0000-4000-8000-000000000001/first-presence-video"), true);
  assert.equal(isFormalApiPath("/api/memories/00000000-0000-4000-8000-000000000001/first-presence-video/00000000-0000-4000-8000-000000000002/playback"), true);
  assert.equal(isFormalApiPath("/api/memories/00000000-0000-4000-8000-000000000001/video-shares"), true);
  assert.equal(isFormalApiPath("/api/memories/00000000-0000-4000-8000-000000000001/video-shares/00000000-0000-4000-8000-000000000002"), true);
  assert.equal(isFormalApiPath("/api/memories/00000000-0000-4000-8000-000000000001/pickups"), true);
  assert.equal(isFormalApiPath("/api/memories/00000000-0000-4000-8000-000000000001/pickups/00000000-0000-4000-8000-000000000002"), true);
  assert.equal(isFormalApiPath("/api/first-presence-video/playback/signed-token"), true);
  assert.equal(isFormalApiPath("/api/video-shares/00000000-0000-4000-8000-000000000002"), true);
  assert.equal(isFormalApiPath("/api/video-shares/00000000-0000-4000-8000-000000000002/playback"), true);
  assert.equal(isFormalApiPath("/api/media/00000000-0000-4000-8000-000000000001"), true);
  for (const pathname of [
    "/api/memories-mvp",
    "/api/memories/",
    "/api/memories//",
    "/api/memories/id/extra",
    "/api/memories/id/chat-session/extra",
    "/api/memories/id/chat-session-suffix",
    "/api/memories/id/first-greeting/extra",
    "/api/memories/id/first-greeting-suffix",
    "/api/memories/id/first-presence-video/extra",
    "/api/memories/id/first-presence-video-suffix",
    "/api/memories/id/first-presence-video/job/playback/extra",
    "/api/memories/id/first-presence-video/job/not-playback",
    "/api/memories/id/video-shares/extra/path",
    "/api/first-presence-video/playback/",
    "/api/first-presence-video/playback/token/extra",
    "/api/video-shares/id/playback/extra",
    "/api/media/",
    "/api/media//",
    "/api/media/id/extra",
    "/api/media-upload",
    "/api/health/private",
  ]) {
    assert.equal(isFormalApiPath(pathname), false, pathname);
    const rejected = middleware(new NextRequest(`https://memoryai.test${pathname}`));
    assert.equal(rejected.status, 410, pathname);
    assert.deepEqual(await rejected.json(), { error: "LEGACY_ROUTE_UNAVAILABLE" }, pathname);
    assertNoStore(rejected);
  }

  for (const method of ["GET", "POST"] as const) {
    const response = middleware(new NextRequest("https://memoryai.test/api/unknown", { method }));
    assert.equal(response.status, 410);
    assert.deepEqual(await response.json(), { error: "LEGACY_ROUTE_UNAVAILABLE" });
    assertNoStore(response);
  }

  const formalMutation = middleware(new NextRequest("https://memoryai.test/api/memories", {
    method: "POST",
  }));
  assert.equal(formalMutation.status, 403);
  assertNoStore(formalMutation);
});

test("video reconciliation is an explicitly audited formal internal route", () => {
  const pathname = "/api/internal/video-reconciliation";
  assert.equal(EXACT_FORMAL_PATHS.has(pathname), true);
  assert.equal(isFormalApiPath(pathname), true);
  const source = readFileSync("app/api/internal/video-reconciliation/_handler.ts", "utf8");
  assert.match(source, /authorizeVideoInternalRequest/);
});

test("every tracked non-formal Route Handler is a route-level 410", async () => {
  const routes = trackedRoutes();
  assert.equal(routes.length, 132, "the audit must enumerate the complete tracked API surface");

  for (const { file, pathname } of routes) {
    const formal = isFormalApiPath(pathname);
    const source = readFileSync(file, "utf8");
    if (formal) {
      assert.doesNotMatch(source, /legacy(?:Route|Mutation)Unavailable/, pathname);
      continue;
    }

    assert.match(source, /legacy(?:Route|Mutation)Unavailable/, pathname);
    const route = await import(pathToFileURL(path.resolve(file)).href) as Record<string, unknown>;
    for (const method of METHODS) {
      const handler = route[method];
      if (typeof handler !== "function") continue;
      const response = await (handler as (request: NextRequest) => Promise<Response> | Response)(
        new NextRequest(`https://memoryai.test${pathname}`, {
          method,
          headers: { origin: "https://memoryai.test" },
        }),
      );
      assert.equal(response.status, 410, `${method} ${pathname}`);
      assert.deepEqual(await response.json(), { error: "LEGACY_ROUTE_UNAVAILABLE" });
      assertNoStore(response);
    }

    if (P0_PATHS.has(pathname)) {
      assert.doesNotMatch(
        source,
        /supabase|cos-nodejs|payment|tencentcloud|openai|provider|createClient/i,
        `${pathname} imports a forbidden client`,
      );
    }
  }
});

test("formal Session ownership and public health contracts remain explicit", async () => {
  const sources = {
    sendCode: readFileSync("app/api/auth/send-code/route.ts", "utf8"),
    verifyCode: readFileSync("app/api/auth/verify-code/route.ts", "utf8"),
    session: readFileSync("app/api/auth/session/route.ts", "utf8"),
    logout: readFileSync("app/api/auth/logout/route.ts", "utf8"),
    wechat: readFileSync("app/api/auth/wechat/_handlers.ts", "utf8"),
    memories: readFileSync("app/api/memories/route.ts", "utf8"),
    memoryRecovery: readFileSync("app/api/memories/recovery/_handler.ts", "utf8"),
    memoryItem: readFileSync("app/api/memories/[id]/_handlers.ts", "utf8"),
    chatSession: readFileSync("app/api/memories/[id]/chat-session/_handler.ts", "utf8"),
    firstGreeting: readFileSync("app/api/memories/[id]/first-greeting/_handler.ts", "utf8"),
    firstPresenceVideo: readFileSync("app/api/memories/[id]/first-presence-video/_handler.ts", "utf8"),
    firstPresencePlayback: readFileSync("app/api/memories/[id]/first-presence-video/[jobId]/playback/_handler.ts", "utf8"),
    signedFirstPresencePlayback: readFileSync("app/api/first-presence-video/playback/[token]/_handler.ts", "utf8"),
    firstPresencePlaybackService: readFileSync("features/video/first-presence-video-playback.ts", "utf8"),
    ownerVideoShares: readFileSync("app/api/memories/[id]/video-shares/_handler.ts", "utf8"),
    ownerVideoShareRevocation: readFileSync("app/api/memories/[id]/video-shares/[publicId]/_handler.ts", "utf8"),
    publicVideoShare: readFileSync("app/api/video-shares/[publicId]/_handler.ts", "utf8"),
    publicVideoSharePlayback: readFileSync("app/api/video-shares/[publicId]/playback/_handler.ts", "utf8"),
    pickups: readFileSync("app/api/memories/[id]/pickups/_handlers.ts", "utf8"),
    memoryChat: readFileSync("app/api/memory-chat/route.ts", "utf8"),
    consents: readFileSync("app/api/consents/route.ts", "utf8"),
    reports: readFileSync("app/api/reports/_handler.ts", "utf8"),
    accountExport: readFileSync("app/api/account/export/route.ts", "utf8"),
    accountProfile: readFileSync("app/api/account/profile/route.ts", "utf8"),
    accountDeletion: readFileSync("app/api/account/deletion/route.ts", "utf8"),
    guardianDeletionConfirmation: readFileSync("app/api/account/deletion/guardian-confirmation/route.ts", "utf8"),
    businessEvents: readFileSync("app/api/business-events/_handler.ts", "utf8"),
    businessFunnel: readFileSync("app/api/business-metrics/funnel/_handler.ts", "utf8"),
    paymentOrders: readFileSync("app/api/payments/orders/route.ts", "utf8"),
    paymentRefunds: readFileSync("app/api/payments/refunds/route.ts", "utf8"),
    paymentEntitlements: readFileSync("app/api/payments/entitlements/route.ts", "utf8"),
    commerceOrders: readFileSync("app/api/commerce/orders/route.ts", "utf8"),
    commerceCredits: readFileSync("app/api/commerce/credits/route.ts", "utf8"),
    commerceOccasionRewards: readFileSync("app/api/commerce/occasion-rewards/route.ts", "utf8"),
    commerceRefunds: readFileSync("app/api/commerce/refunds/route.ts", "utf8"),
    commerceReferralCode: readFileSync("app/api/commerce/referrals/code/route.ts", "utf8"),
    commerceReferralQualifications: readFileSync("app/api/commerce/referrals/qualifications/route.ts", "utf8"),
    commerceTestCallback: readFileSync("app/api/commerce/testing/callbacks/route.ts", "utf8"),
    commerceReconciliation: readFileSync("app/api/internal/commerce-reconciliation/route.ts", "utf8"),
    operationsAlerts: readFileSync("app/api/internal/operations/alerts/_handler.ts", "utf8"),
    operationsSummary: readFileSync("app/api/internal/operations/summary/_handler.ts", "utf8"),
    videoReviews: readFileSync("app/api/internal/video-reviews/_handler.ts", "utf8"),
    videoReconciliation: readFileSync("app/api/internal/video-reconciliation/_handler.ts", "utf8"),
    videoInternalAccess: readFileSync("src/server/security/video-internal-access.ts", "utf8"),
    media: readFileSync("app/api/media/_lib.ts", "utf8"),
  };
  assert.match(sources.sendCode, /createSendCodeHandler/);
  assert.match(sources.verifyCode, /createVerifyCodeHandler/);
  assert.match(sources.session, /verifyRequestSession/);
  for (const source of [sources.memoryItem, sources.chatSession, sources.firstGreeting]) assert.match(source, /resolveSessionOwner/);
  assert.match(sources.pickups, /resolveSessionOwner/);
  assert.match(sources.pickups, /requireAllowedOrigin/);
  assert.match(sources.firstPresenceVideo, /verifyRequestSession/);
  assert.doesNotMatch(sources.firstPresenceVideo, /resolveSessionOwner|compatibilityUserId|userId" in body/);
  assert.match(sources.firstPresencePlayback, /verifyRequestSession/);
  assert.doesNotMatch(sources.firstPresencePlayback, /artifactKey|providerTaskId|manualReview/);
  assert.match(sources.signedFirstPresencePlayback, /verifyRequestSession/);
  assert.doesNotMatch(sources.signedFirstPresencePlayback, /nextUrl\.searchParams\.get\(["'](?:key|path)/);
  assert.match(sources.firstPresencePlaybackService, /findApprovedForOwner/);
  for (const source of [sources.ownerVideoShares, sources.ownerVideoShareRevocation]) {
    assert.match(source, /verifyRequestSession/);
    assert.match(source, /requireAllowedOrigin/);
    assert.match(source, /applyAuthNoStore/);
  }
  assert.doesNotMatch(sources.ownerVideoShares, /artifactKey|providerTaskId|storage_key/);
  assert.match(sources.publicVideoShare, /X-Robots-Tag/);
  assert.doesNotMatch(sources.publicVideoShare, /artifactKey|providerTaskId|storage_key/);
  assert.match(sources.publicVideoSharePlayback, /findActivePublic/);
  assert.match(sources.publicVideoSharePlayback, /Content-Disposition.*inline/);
  for (const source of [sources.memoryChat, sources.media]) assert.match(source, /verifyRequestSession/);
  assert.match(sources.consents, /createConsentsHandler/);
  assert.match(sources.reports, /verifyRequestSession/);
  assert.match(sources.reports, /requireAllowedOrigin/);
  assert.match(sources.accountExport, /createAccountDataExportHandler/);
  assert.match(sources.accountProfile, /createAccountProfileHandlers/);
  assert.match(sources.accountDeletion, /createAccountDeletionHandler/);
  assert.match(sources.guardianDeletionConfirmation, /createGuardianDeletionConfirmationHandler/);
  assert.match(sources.operationsAlerts, /OPERATIONS_METRICS_ACCESS_TOKEN/);
  assert.match(sources.operationsAlerts, /parseOperationsAlertThresholds/);
  assert.match(sources.operationsSummary, /OPERATIONS_METRICS_ACCESS_TOKEN/);
  assert.match(sources.logout, /clearSessionCookie/);
  assert.doesNotMatch(
    sources.wechat,
    /verifyRequestSession|getSession|linkUserId|currentUserId/,
  );
  assert.match(sources.wechat, /setSessionCookie/);
  assert.doesNotMatch(sources.wechat, /openid|unionid|appSecret/i);
  assert.match(sources.memories, /resolveSessionOwner/);
  assert.match(sources.memoryRecovery, /resolveSessionOwner/);
  assert.match(sources.memoryRecovery, /MemoryPostgresDataSource/);
  assert.doesNotMatch(
    sources.memoryRecovery,
    /supabase|creation_idempotency_key|storage_key/i,
  );
  assert.match(sources.paymentOrders, /createPaymentOrdersHandler/);
  assert.match(sources.paymentRefunds, /createPaymentRefundsHandler/);
  assert.match(sources.paymentEntitlements, /isLegacyChatCommerceTestAccount/);
  assert.match(sources.commerceOrders, /createCommerceOrdersHandler/);
  assert.match(sources.commerceCredits, /verifyRequestSession/);
  assert.match(sources.commerceOccasionRewards, /createOccasionRewardHandler/);
  assert.match(sources.commerceRefunds, /verifyRequestSession/);
  assert.match(sources.commerceReferralCode, /createReferralCodeHandler/);
  assert.match(sources.commerceReferralQualifications, /createReferralQualificationHandler/);
  assert.match(sources.commerceTestCallback, /createCommerceTestCallbackHandler/);
  assert.match(sources.commerceReconciliation, /COMMERCE_RECONCILIATION_ACCESS_TOKEN/);
  assert.match(sources.videoReviews, /authorizeVideoInternalRequest/);
  assert.match(sources.videoReconciliation, /authorizeVideoInternalRequest/);
  assert.match(sources.videoInternalAccess, /VIDEO_REVIEW_ACCESS_TOKEN/);
  assert.match(sources.videoInternalAccess, /VIDEO_RECONCILIATION_ACCESS_TOKEN/);
  assert.match(sources.videoInternalAccess, /constantTimeEquals/);
  assert.match(sources.businessEvents, /verifyRequestSession/);
  assert.match(sources.businessFunnel, /BUSINESS_METRICS_ACCESS_TOKEN/);

  const { GET: aiHealth } = await import("./health/ai/route");
  const response = await aiHealth();
  const body = await response.json() as Record<string, unknown>;
  assert.deepEqual(Object.keys(body).sort(), ["llmProvider", "status"]);
  assert.equal(body.llmProvider, "mock");
  assert.doesNotMatch(JSON.stringify(body), /key|registered|secret/i);
});
