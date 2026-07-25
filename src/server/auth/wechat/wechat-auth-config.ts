import { WeChatAuthError } from "./wechat-auth-error";

export type WeChatAuthConfig = {
  appId: string;
  appSecret: string;
  redirectUri: string;
  identityPepper: string;
};

export type WeChatAuthCapability = {
  provider: "wechat";
  available: boolean;
};

function readConfig(
  environment: NodeJS.ProcessEnv,
): WeChatAuthConfig | null {
  const appId = environment.WECHAT_AUTH_APP_ID?.trim();
  const appSecret = environment.WECHAT_AUTH_APP_SECRET?.trim();
  const redirectUri = environment.WECHAT_AUTH_REDIRECT_URI?.trim();
  const identityPepper = environment.WECHAT_AUTH_IDENTITY_PEPPER?.trim();

  if (!appId || !appSecret || !redirectUri || !identityPepper) return null;
  if (
    appId !== environment.WECHAT_AUTH_APP_ID
    || appSecret !== environment.WECHAT_AUTH_APP_SECRET
    || redirectUri !== environment.WECHAT_AUTH_REDIRECT_URI
    || identityPepper !== environment.WECHAT_AUTH_IDENTITY_PEPPER
    || !/^wx[0-9a-fA-F]{16}$/.test(appId)
    || Buffer.byteLength(appSecret, "utf8") < 16
    || appSecret.length > 256
    || Buffer.byteLength(identityPepper, "utf8") < 32
  ) {
    return null;
  }

  try {
    const callback = new URL(redirectUri);
    const allowedOrigin = environment.AUTH_ALLOWED_ORIGIN?.trim();
    if (
      callback.protocol !== "https:"
      || callback.username
      || callback.password
      || callback.search
      || callback.hash
      || callback.pathname !== "/api/auth/wechat/callback"
      || !allowedOrigin
      || callback.origin !== allowedOrigin.replace(/\/$/, "")
    ) {
      return null;
    }
  } catch {
    return null;
  }

  return { appId, appSecret, redirectUri, identityPepper };
}

export function getWeChatAuthCapability(
  environment: NodeJS.ProcessEnv = process.env,
): WeChatAuthCapability {
  return {
    provider: "wechat",
    available: readConfig(environment) !== null,
  };
}

export function requireWeChatAuthConfig(
  environment: NodeJS.ProcessEnv = process.env,
): WeChatAuthConfig {
  const config = readConfig(environment);
  if (!config) throw new WeChatAuthError("WECHAT_AUTH_UNAVAILABLE");
  return config;
}
