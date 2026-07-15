import { NextRequest } from "next/server";

import {
  AuthPostgresRepository,
  AuthService,
  authJson,
  authRouteError,
  getSmsVerificationProvider,
  requireAllowedOrigin,
  requireTrustedRequestIp,
} from "@/src/server/auth";

type ServicePort = Pick<AuthService, "sendCode">;
const createService = (): ServicePort =>
  new AuthService(new AuthPostgresRepository(), getSmsVerificationProvider());

export function createSendCodeHandler(serviceFactory: () => ServicePort = createService) {
  return async function sendCode(request: NextRequest) {
    try {
      requireAllowedOrigin(request);
      const requestIp = requireTrustedRequestIp(request);
      let body: unknown;
      try {
        body = await request.json();
      } catch {
        return authJson({ error: "INVALID_JSON" }, { status: 400 });
      }
      const phone = typeof body === "object" && body !== null && "phone" in body
        ? body.phone
        : undefined;
      const result = await serviceFactory().sendCode(phone, requestIp);
      if (result.status === "invalid_phone") {
        return authJson({ error: "INVALID_PHONE" }, { status: 400 });
      }
      if (result.status === "rate_limited") {
        return authJson({ error: "VERIFICATION_RATE_LIMITED" }, { status: 429 });
      }
      return authJson({
        accepted: true,
        challengeId: result.challengeId,
        resendAfter: result.resendAfter,
      }, { status: 202 });
    } catch (error) {
      return authRouteError(error);
    }
  };
}
