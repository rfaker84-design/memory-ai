import { NextRequest, NextResponse } from "next/server";

import {
  CommerceConfigurationError,
  CommercePostgresDataSource,
  CommerceRepository,
  CommerceService,
  CommerceStateError,
  DeviceAttestationVerifier,
  UnconfiguredDeviceAttestationVerifier,
  assertVerifiedDevice,
} from "@/features/commerce";
import {
  requireAllowedOrigin,
  type AuthSession,
  verifyRequestSession,
} from "@/src/server/auth";
import { applyAuthNoStore } from "@/src/server/security/auth-cache";

type QualificationService = Pick<CommerceService, "qualifyReferral">;
type SessionResolver = (request: NextRequest) => Promise<AuthSession | null>;
const KEY_PATTERN = /^[A-Za-z0-9._:-]{16,128}$/;
const json = (body: Record<string, unknown>, init?: ResponseInit) =>
  applyAuthNoStore(NextResponse.json(body, init));
const service = (): QualificationService =>
  new CommerceService(
    new CommerceRepository(new CommercePostgresDataSource()),
  );

export function createReferralQualificationHandler(
  serviceFactory: () => QualificationService = service,
  sessionResolver: SessionResolver = verifyRequestSession,
  verifier: DeviceAttestationVerifier =
    new UnconfiguredDeviceAttestationVerifier(),
) {
  return async function POST(request: NextRequest) {
    const session = await sessionResolver(request);
    if (!session) return json({ error: "UNAUTHENTICATED" }, { status: 401 });
    requireAllowedOrigin(request);
    const requestKey = request.headers.get("idempotency-key");
    if (!requestKey || !KEY_PATTERN.test(requestKey)) {
      return json({ error: "INVALID_IDEMPOTENCY_KEY" }, { status: 400 });
    }
    const body = await request.json().catch(() => null);
    if (
      typeof body !== "object"
      || body === null
      || Array.isArray(body)
      || Object.keys(body).sort().join(",") !== "code,deviceAttestation"
    ) {
      return json({ error: "INVALID_REFERRAL_REQUEST" }, { status: 400 });
    }
    const input = body as Record<string, unknown>;
    if (
      typeof input.code !== "string"
      || typeof input.deviceAttestation !== "string"
      || input.deviceAttestation.length > 4096
    ) {
      return json({ error: "INVALID_REFERRAL_REQUEST" }, { status: 400 });
    }
    try {
      const device = assertVerifiedDevice(
        await verifier.verify(input.deviceAttestation),
      );
      const qualification = await serviceFactory().qualifyReferral({
        inviteeExternalUserId: session.externalUserId,
        requestKey,
        code: input.code,
        deviceKeyHash: device.deviceKeyHash,
      });
      return json({ qualification }, { status: 201 });
    } catch (error) {
      if (error instanceof CommerceConfigurationError) {
        return json({ error: error.code }, { status: 503 });
      }
      if (error instanceof CommerceStateError) {
        return json({ error: "REFERRAL_NOT_QUALIFIED" }, { status: 409 });
      }
      return json({ error: "INVALID_REFERRAL_REQUEST" }, { status: 400 });
    }
  };
}
