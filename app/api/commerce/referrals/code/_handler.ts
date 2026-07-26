import { NextRequest, NextResponse } from "next/server";

import {
  CommerceNotFoundError,
  CommercePostgresDataSource,
  CommerceRepository,
  CommerceService,
} from "@/features/commerce";
import {
  requireAllowedOrigin,
  type AuthSession,
  verifyRequestSession,
} from "@/src/server/auth";
import { applyAuthNoStore } from "@/src/server/security/auth-cache";

type ReferralService = Pick<
  CommerceService,
  "createReferralCode" | "getReferralStatus"
>;
type SessionResolver = (request: NextRequest) => Promise<AuthSession | null>;
const KEY_PATTERN = /^[A-Za-z0-9._:-]{16,128}$/;
const json = (body: Record<string, unknown>, init?: ResponseInit) =>
  applyAuthNoStore(NextResponse.json(body, init));
const service = (): ReferralService =>
  new CommerceService(
    new CommerceRepository(new CommercePostgresDataSource()),
  );

export function createReferralCodeHandler(
  serviceFactory: () => ReferralService = service,
  sessionResolver: SessionResolver = verifyRequestSession,
) {
  return {
    GET: async (request: NextRequest) => {
      const session = await sessionResolver(request);
      if (!session) return json({ error: "UNAUTHENTICATED" }, { status: 401 });
      try {
        return json({
          referral: await serviceFactory().getReferralStatus(
            session.externalUserId,
          ),
        });
      } catch (error) {
        if (error instanceof CommerceNotFoundError) {
          return json({ error: "REFERRAL_CODE_NOT_CREATED" }, { status: 404 });
        }
        return json({ error: "REFERRAL_UNAVAILABLE" }, { status: 503 });
      }
    },
    POST: async (request: NextRequest) => {
      const session = await sessionResolver(request);
      if (!session) return json({ error: "UNAUTHENTICATED" }, { status: 401 });
      requireAllowedOrigin(request);
      const requestKey = request.headers.get("idempotency-key");
      if (!requestKey || !KEY_PATTERN.test(requestKey)) {
        return json({ error: "INVALID_IDEMPOTENCY_KEY" }, { status: 400 });
      }
      try {
        const referral = await serviceFactory().createReferralCode({
          externalUserId: session.externalUserId,
          requestKey,
        });
        return json({ referral }, { status: 201 });
      } catch {
        return json({ error: "REFERRAL_UNAVAILABLE" }, { status: 503 });
      }
    },
  };
}
