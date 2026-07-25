import { NextRequest, NextResponse } from "next/server";

import {
  AuthConfigurationError,
  WeChatAuthError,
  WeChatAuthPostgresRepository,
  WeChatAuthService,
  applyAuthNoStore,
  authJson,
  authRouteError,
  getWeChatAuthCapability,
  getWeChatAuthProvider,
  issueSession,
  setSessionCookie,
} from "@/src/server/auth";

type ServicePort = Pick<WeChatAuthService, "begin" | "complete" | "cancel" | "fail">;

export type WeChatHandlerDependencies = {
  createService: () => ServicePort;
  createSession: typeof issueSession;
  capability: typeof getWeChatAuthCapability;
};

const defaultDependencies: WeChatHandlerDependencies = {
  createService: () => new WeChatAuthService(
    new WeChatAuthPostgresRepository(),
    getWeChatAuthProvider(),
  ),
  createSession: issueSession,
  capability: getWeChatAuthCapability,
};

function exactQuery(
  request: NextRequest,
  allowed: readonly string[],
): Record<string, string> | null {
  const allowedSet = new Set(allowed);
  const values: Record<string, string> = {};
  for (const key of request.nextUrl.searchParams.keys()) {
    if (
      !allowedSet.has(key)
      || request.nextUrl.searchParams.getAll(key).length !== 1
    ) {
      return null;
    }
    values[key] = request.nextUrl.searchParams.get(key) ?? "";
  }
  return values;
}

function browserDestination(code: string): URL {
  const configured = process.env.AUTH_ALLOWED_ORIGIN?.trim();
  if (!configured) {
    throw new AuthConfigurationError("AUTH_ALLOWED_ORIGIN_NOT_CONFIGURED");
  }
  try {
    const origin = new URL(configured);
    if (
      origin.protocol !== "https:"
      || origin.origin !== configured.replace(/\/$/, "")
      || origin.username
      || origin.password
    ) {
      throw new Error("invalid");
    }
    const destination = new URL("/login", origin);
    destination.searchParams.set("wechat", code);
    return destination;
  } catch {
    throw new AuthConfigurationError("AUTH_ALLOWED_ORIGIN_INVALID");
  }
}

function redirectToBrowser(code: string): NextResponse {
  return applyAuthNoStore(NextResponse.redirect(browserDestination(code), 302));
}

function redirectForError(error: unknown): NextResponse {
  if (error instanceof WeChatAuthError) {
    try {
      return redirectToBrowser(error.code);
    } catch {
      return authRouteError(error);
    }
  }
  return authRouteError(error);
}

export function createWeChatStatusHandler(
  dependencies: Pick<WeChatHandlerDependencies, "capability"> = defaultDependencies,
) {
  return function weChatStatus(request: NextRequest) {
    if (!exactQuery(request, [])) {
      return authJson({ error: "WECHAT_AUTH_FAILED" }, { status: 400 });
    }
    return authJson(dependencies.capability());
  };
}

export function createWeChatStartHandler(
  dependencies: Pick<
    WeChatHandlerDependencies,
    "createService"
  > = defaultDependencies,
) {
  return async function weChatStart(request: NextRequest) {
    try {
      if (!exactQuery(request, [])) {
        return authJson({ error: "WECHAT_AUTH_FAILED" }, { status: 400 });
      }
      const result = await dependencies.createService().begin();
      return applyAuthNoStore(NextResponse.redirect(result.authorizationUrl, 302));
    } catch (error) {
      return authRouteError(error);
    }
  };
}

export function createWeChatCallbackHandler(
  dependencies: Pick<
    WeChatHandlerDependencies,
    "createService" | "createSession"
  > = defaultDependencies,
) {
  return async function weChatCallback(request: NextRequest) {
    try {
      const query = exactQuery(request, ["state", "code", "error"]);
      if (!query || !query.state) {
        throw new WeChatAuthError("WECHAT_AUTH_STATE_INVALID");
      }
      const service = dependencies.createService();
      if (query.error) {
        if (query.code) throw new WeChatAuthError("WECHAT_AUTH_FAILED");
        if (query.error === "access_denied") await service.cancel(query.state);
        await service.fail(query.state);
      }
      if (!query.code) throw new WeChatAuthError("WECHAT_AUTH_FAILED");

      const user = await service.complete({
        state: query.state,
        code: query.code,
      });
      const token = await dependencies.createSession({
        userId: user.id,
        externalUserId: user.externalUserId,
      });
      const response = redirectToBrowser("success");
      setSessionCookie(response, token);
      return response;
    } catch (error) {
      return redirectForError(error);
    }
  };
}

function createTerminalHandler(
  action: "cancel" | "fail",
  dependencies: Pick<WeChatHandlerDependencies, "createService">,
) {
  return async function terminalHandler(request: NextRequest) {
    try {
      const query = exactQuery(request, ["state"]);
      if (!query?.state) {
        throw new WeChatAuthError("WECHAT_AUTH_STATE_INVALID");
      }
      await dependencies.createService()[action](query.state);
      throw new WeChatAuthError(
        action === "cancel" ? "WECHAT_AUTH_CANCELLED" : "WECHAT_AUTH_FAILED",
      );
    } catch (error) {
      return redirectForError(error);
    }
  };
}

export function createWeChatCancelHandler(
  dependencies: Pick<WeChatHandlerDependencies, "createService"> = defaultDependencies,
) {
  return createTerminalHandler("cancel", dependencies);
}

export function createWeChatFailureHandler(
  dependencies: Pick<WeChatHandlerDependencies, "createService"> = defaultDependencies,
) {
  return createTerminalHandler("fail", dependencies);
}
