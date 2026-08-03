import { NextRequest, NextResponse } from "next/server";

import {
  CommercePostgresDataSource,
  CommerceRepository,
  CommerceService,
  CommerceStateError,
  CommerceValidationError,
  type OccasionKind,
  type OccasionRewardOffer,
} from "@/features/commerce";
import {
  AuthConfigurationError,
  requireAllowedOrigin,
  type AuthSession,
  verifyRequestSession,
} from "@/src/server/auth";
import { DatabaseDependencyError } from "@/src/server/database";
import { applyAuthNoStore } from "@/src/server/security/auth-cache";

const REQUEST_KEY = /^[A-Za-z0-9._:-]{16,128}$/;
const OCCASIONS = new Set<OccasionKind>(["birthday", "mothers_day", "fathers_day"]);
const json = (body: Record<string, unknown>, init?: ResponseInit) =>
  applyAuthNoStore(NextResponse.json(body, init));

type OccasionService = Pick<CommerceService, "claimOccasionReward" | "listOpenOccasionRewardOffers">;
type SessionResolver = (request: NextRequest) => Promise<AuthSession | null>;

const service = (): OccasionService => new CommerceService(
  new CommerceRepository(new CommercePostgresDataSource()),
);

function parseOccasion(value: unknown): OccasionKind | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const body = value as Record<string, unknown>;
  if (Object.keys(body).join(",") !== "occasion" || typeof body.occasion !== "string") return null;
  return OCCASIONS.has(body.occasion as OccasionKind) ? body.occasion as OccasionKind : null;
}

function failure(error: unknown) {
  if (error instanceof CommerceValidationError) return json({ error: "INVALID_OCCASION_REWARD_REQUEST" }, { status: 400 });
  if (error instanceof CommerceStateError) {
    const code = error.message;
    return json(
      { error: code },
      { status: code === "OCCASION_CLAIM_NOT_OPEN" ? 409 : 503 },
    );
  }
  if (error instanceof DatabaseDependencyError) return json({ error: "COMMERCE_UNAVAILABLE" }, { status: 503 });
  if (error instanceof AuthConfigurationError) {
    return json({ error: error.code === "ORIGIN_NOT_ALLOWED" ? "ORIGIN_NOT_ALLOWED" : "AUTH_UNAVAILABLE" }, { status: error.code === "ORIGIN_NOT_ALLOWED" ? 403 : 503 });
  }
  console.error("[api:commerce:occasion-rewards] request failed");
  return json({ error: "COMMERCE_UNAVAILABLE" }, { status: 503 });
}

export function createOccasionRewardHandler(
  serviceFactory: () => OccasionService = service,
  sessionResolver: SessionResolver = verifyRequestSession,
) {
  return {
    GET: async (request: NextRequest) => {
      try {
        const session = await sessionResolver(request);
        if (!session) return json({ error: "UNAUTHENTICATED" }, { status: 401 });
        if ([...request.nextUrl.searchParams.keys()].length !== 0) {
          return json({ error: "INVALID_OCCASION_REWARD_REQUEST" }, { status: 400 });
        }
        const offers: OccasionRewardOffer[] = await serviceFactory().listOpenOccasionRewardOffers({
          externalUserId: session.externalUserId,
        });
        return json({ offers });
      } catch (error) {
        return failure(error);
      }
    },
    POST: async (request: NextRequest) => {
    try {
      const session = await sessionResolver(request);
      if (!session) return json({ error: "UNAUTHENTICATED" }, { status: 401 });
      requireAllowedOrigin(request);
      const requestKey = request.headers.get("idempotency-key");
      if (!requestKey || !REQUEST_KEY.test(requestKey)) return json({ error: "INVALID_IDEMPOTENCY_KEY" }, { status: 400 });
      const occasion = parseOccasion(await request.json().catch(() => null));
      if (!occasion) return json({ error: "INVALID_OCCASION_REWARD_REQUEST" }, { status: 400 });
      return json({ reward: await serviceFactory().claimOccasionReward({
        externalUserId: session.externalUserId,
        requestKey,
        occasion,
      }) });
    } catch (error) {
      return failure(error);
    }
    },
  };
}
