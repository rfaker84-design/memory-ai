import { NextRequest } from "next/server";

import {
  AuthPostgresRepository,
  AuthService,
  authJson,
  authRouteError,
  getSmsVerificationProvider,
  issueSession,
  requireAllowedOrigin,
  setSessionCookie,
} from "@/src/server/auth";

type ServicePort = Pick<AuthService, "verifyCode">;
const createService = (): ServicePort =>
  new AuthService(new AuthPostgresRepository(), getSmsVerificationProvider());

export function createVerifyCodeHandler(serviceFactory: () => ServicePort = createService) {
  return async function verifyCode(request: NextRequest) {
    try {
      requireAllowedOrigin(request);
      let body: unknown;
      try {
        body = await request.json();
      } catch {
        return authJson({ error: "INVALID_JSON" }, { status: 400 });
      }
      if (typeof body !== "object" || body === null) {
        return authJson({ error: "VERIFICATION_FAILED" }, { status: 400 });
      }
      const record = body as Record<string, unknown>;
      const result = await serviceFactory().verifyCode({
        phone: record.phone,
        code: typeof record.code === "string" ? record.code : "",
        challengeId: typeof record.challengeId === "string" ? record.challengeId : "",
      });
      if (result.status !== "verified") {
        return authJson({ error: "VERIFICATION_FAILED" }, { status: 400 });
      }
      const token = await issueSession({
        userId: result.user.id,
        externalUserId: result.user.externalUserId,
      });
      const response = authJson({
        authenticated: true,
        user: { id: result.user.id, createdAt: result.user.createdAt },
      });
      setSessionCookie(response, token);
      return response;
    } catch (error) {
      return authRouteError(error);
    }
  };
}
