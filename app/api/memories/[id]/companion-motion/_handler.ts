import { NextRequest, NextResponse } from "next/server";

import {
  CompanionMotionPackError,
  CompanionMotionPackService,
  companionMotionStagingReviewEnabled,
  createFirstPresenceVideoOwnerInputStaging,
} from "@/features/video";
import {
  AuthConfigurationError,
  requireAllowedOrigin,
  type AuthSession,
  verifyRequestSession,
} from "@/src/server/auth";
import { DatabaseDependencyError } from "@/src/server/database";
import { applyAuthNoStore } from "@/src/server/security/auth-cache";
import {
  assertProductCapabilityEnabled,
  ProductCapabilityUnavailableError,
} from "@/src/server/runtime/product-capability-gate";

type Context = { params: Promise<{ id: string }> };
type SessionResolver = (request: NextRequest) => Promise<AuthSession | null>;
type PackService = Pick<CompanionMotionPackService, "ensure" | "ensureIdleVisualReview" | "ensureAttentiveVisualReview" | "ensureAttentiveStillVisualReview" | "ensureAttentiveFocusVisualReview" | "ensureAcknowledgementVisualReview" | "ensureReflectiveVisualReview" | "getState">;
type CapabilityGuard = () => void;
type StagingReviewGuard = () => boolean;

const json = (body: Record<string, unknown>, init?: ResponseInit) =>
  applyAuthNoStore(NextResponse.json(body, init));
const service = (): PackService =>
  new CompanionMotionPackService(createFirstPresenceVideoOwnerInputStaging);

function failure(error: unknown) {
  if (error instanceof CompanionMotionPackError) {
    const status = error.code === "MEMORY_NOT_FOUND" ? 404
      : error.code === "ACTIVE_ENTITLEMENT_REQUIRED" || error.code === "STAGING_REVIEW_ONLY" ? 403
        : error.code === "PHOTO_PRECONDITION_REQUIRED" ? 409 : 503;
    return json({ error: error.code }, { status });
  }
  if (error instanceof ProductCapabilityUnavailableError) {
    return json({ error: error.code }, { status: 503 });
  }
  if (error instanceof DatabaseDependencyError) return json({ error: "DATABASE_UNAVAILABLE" }, { status: 503 });
  if (error instanceof AuthConfigurationError) {
    return json({ error: error.code === "ORIGIN_NOT_ALLOWED" ? "ORIGIN_NOT_ALLOWED" : "AUTH_UNAVAILABLE" }, {
      status: error.code === "ORIGIN_NOT_ALLOWED" ? 403 : 503,
    });
  }
  console.error("[api:companion-motion] request failed");
  return json({ error: "COMPANION_MOTION_UNAVAILABLE" }, { status: 503 });
}

export function createCompanionMotionHandler(
  serviceFactory: () => PackService = service,
  sessionResolver: SessionResolver = verifyRequestSession,
  capabilityGuard: CapabilityGuard = () => assertProductCapabilityEnabled("video_generation"),
  stagingReviewGuard: StagingReviewGuard = () => companionMotionStagingReviewEnabled(),
) {
  return {
    GET: async (request: NextRequest, { params }: Context) => {
      try {
        const session = await sessionResolver(request);
        if (!session) return json({ error: "UNAUTHENTICATED" }, { status: 401 });
        if ([...request.nextUrl.searchParams.keys()].length > 0) return json({ error: "INVALID_COMPANION_MOTION_REQUEST" }, { status: 400 });
        const { id: memoryId } = await params;
        return json(await serviceFactory().getState({ externalUserId: session.externalUserId, memoryId }));
      } catch (error) { return failure(error); }
    },
    POST: async (request: NextRequest, { params }: Context) => {
      try {
        const session = await sessionResolver(request);
        if (!session) return json({ error: "UNAUTHENTICATED" }, { status: 401 });
        requireAllowedOrigin(request);
        capabilityGuard();
        const body = await request.json().catch(() => null);
        if (typeof body !== "object" || body === null || Array.isArray(body)) {
          return json({ error: "INVALID_COMPANION_MOTION_REQUEST" }, { status: 400 });
        }
        const { id: memoryId } = await params;
        const review = Object.keys(body).length === 1 ? (body as Record<string, unknown>).review : null;
        const reviewIdle = review === "idle-visual";
        const reviewAttentive = review === "attentive-visual";
        const reviewAttentiveStill = review === "attentive-still-visual";
        const reviewAttentiveFocus = review === "attentive-focus-visual";
        const reviewAcknowledgement = review === "acknowledgement-visual";
        const reviewReflective = review === "reflective-visual";
        if (Object.keys(body).length !== 0 && !reviewIdle && !reviewAttentive && !reviewAttentiveStill && !reviewAttentiveFocus && !reviewAcknowledgement && !reviewReflective) {
          return json({ error: "INVALID_COMPANION_MOTION_REQUEST" }, { status: 400 });
        }
        if ((reviewIdle || reviewAttentive || reviewAttentiveStill || reviewAttentiveFocus || reviewAcknowledgement || reviewReflective) && !stagingReviewGuard()) {
          return json({ error: "INVALID_COMPANION_MOTION_REQUEST" }, { status: 400 });
        }
        const slots = reviewIdle
          ? await serviceFactory().ensureIdleVisualReview({ externalUserId: session.externalUserId, memoryId })
          : reviewAttentive
            ? await serviceFactory().ensureAttentiveVisualReview({ externalUserId: session.externalUserId, memoryId })
            : reviewAttentiveStill
              ? await serviceFactory().ensureAttentiveStillVisualReview({ externalUserId: session.externalUserId, memoryId })
              : reviewAttentiveFocus
                ? await serviceFactory().ensureAttentiveFocusVisualReview({ externalUserId: session.externalUserId, memoryId })
              : reviewAcknowledgement
                ? await serviceFactory().ensureAcknowledgementVisualReview({ externalUserId: session.externalUserId, memoryId })
                : reviewReflective
                  ? await serviceFactory().ensureReflectiveVisualReview({ externalUserId: session.externalUserId, memoryId })
                  : await serviceFactory().ensure({ externalUserId: session.externalUserId, memoryId });
        return json({ eligible: true, slots }, { status: 202 });
      } catch (error) { return failure(error); }
    },
  };
}
