import type { WeChatAuthConfig } from "./wechat-auth-config";
import { requireWeChatAuthConfig } from "./wechat-auth-config";
import { WeChatAuthError } from "./wechat-auth-error";

const WECHAT_AUTHORIZE_ENDPOINT = "https://open.weixin.qq.com/connect/qrconnect";
const WECHAT_TOKEN_ENDPOINT = "https://api.weixin.qq.com/sns/oauth2/access_token";

export type WeChatProviderIdentity = {
  openId: string;
  unionId: string | null;
};

export interface WeChatAuthProviderPort {
  readonly appId: string;
  readonly identityPepper: string;
  authorizationUrl(state: string): string;
  exchangeCode(code: string): Promise<WeChatProviderIdentity>;
}

type FetchPort = typeof fetch;

export class WeChatOfficialAuthProvider implements WeChatAuthProviderPort {
  readonly appId: string;
  readonly identityPepper: string;

  constructor(
    private readonly config: WeChatAuthConfig,
    private readonly fetchImpl: FetchPort = fetch,
  ) {
    this.appId = config.appId;
    this.identityPepper = config.identityPepper;
  }

  authorizationUrl(state: string): string {
    const url = new URL(WECHAT_AUTHORIZE_ENDPOINT);
    url.searchParams.set("appid", this.config.appId);
    url.searchParams.set("redirect_uri", this.config.redirectUri);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("scope", "snsapi_login");
    url.searchParams.set("state", state);
    return `${url.toString()}#wechat_redirect`;
  }

  async exchangeCode(code: string): Promise<WeChatProviderIdentity> {
    const url = new URL(WECHAT_TOKEN_ENDPOINT);
    url.searchParams.set("appid", this.config.appId);
    url.searchParams.set("secret", this.config.appSecret);
    url.searchParams.set("code", code);
    url.searchParams.set("grant_type", "authorization_code");

    let response: Response;
    try {
      response = await this.fetchImpl(url, {
        method: "GET",
        cache: "no-store",
        signal: AbortSignal.timeout(5_000),
      });
    } catch {
      throw new WeChatAuthError("WECHAT_AUTH_FAILED");
    }
    if (!response.ok) throw new WeChatAuthError("WECHAT_AUTH_FAILED");

    let payload: unknown;
    try {
      payload = await response.json();
    } catch {
      throw new WeChatAuthError("WECHAT_AUTH_FAILED");
    }
    if (
      typeof payload !== "object"
      || payload === null
      || Array.isArray(payload)
      || "errcode" in payload
      || !("openid" in payload)
      || typeof payload.openid !== "string"
      || !/^[A-Za-z0-9_-]{1,256}$/.test(payload.openid)
    ) {
      throw new WeChatAuthError("WECHAT_AUTH_FAILED");
    }
    const unionId = "unionid" in payload ? payload.unionid : null;
    if (
      unionId !== null
      && (
        typeof unionId !== "string"
        || !/^[A-Za-z0-9_-]{1,256}$/.test(unionId)
      )
    ) {
      throw new WeChatAuthError("WECHAT_AUTH_FAILED");
    }
    return { openId: payload.openid, unionId };
  }
}

export function getWeChatAuthProvider(): WeChatAuthProviderPort {
  return new WeChatOfficialAuthProvider(requireWeChatAuthConfig());
}
