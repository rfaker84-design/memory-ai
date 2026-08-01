export const WECHAT_AUTH_STATUS_PATH = "/api/auth/wechat/status";
export const WECHAT_AUTH_START_PATH = "/api/auth/wechat/start";

export const LOGIN_AGREEMENT_NOTICE = "请先阅读并同意《用户协议》和《隐私政策》。";
export const WECHAT_AUTH_UNAVAILABLE_NOTICE = "微信登录暂未开放，请使用手机号登录。";
export const WECHAT_AUTH_CHECKING_NOTICE = "正在确认微信登录状态，请稍后再试。";

export type WeChatProviderState = "checking" | "available" | "unavailable";

type FetchPort = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

export async function loadWeChatProviderState(
  fetchPort: FetchPort = fetch,
  signal?: AbortSignal,
): Promise<Exclude<WeChatProviderState, "checking">> {
  try {
    const response = await fetchPort(WECHAT_AUTH_STATUS_PATH, {
      method: "GET",
      credentials: "same-origin",
      cache: "no-store",
      signal,
    });
    if (!response.ok) return "unavailable";
    const payload: unknown = await response.json();
    if (
      typeof payload !== "object"
      || payload === null
      || Array.isArray(payload)
      || !("provider" in payload)
      || !("available" in payload)
      || payload.provider !== "wechat"
      || typeof payload.available !== "boolean"
    ) {
      return "unavailable";
    }
    return payload.available ? "available" : "unavailable";
  } catch {
    return "unavailable";
  }
}

export function resolveWeChatLoginAction(
  agreementAccepted: boolean,
  providerState: WeChatProviderState,
): { type: "navigate"; href: string } | { type: "notice"; message: string } {
  if (!agreementAccepted) return { type: "notice", message: LOGIN_AGREEMENT_NOTICE };
  if (providerState === "checking") return { type: "notice", message: WECHAT_AUTH_CHECKING_NOTICE };
  if (providerState === "unavailable") return { type: "notice", message: WECHAT_AUTH_UNAVAILABLE_NOTICE };
  return { type: "navigate", href: WECHAT_AUTH_START_PATH };
}

export function resolveSmsLoginAction(
  agreementAccepted: boolean,
): { type: "allow" } | { type: "notice"; message: string } {
  return agreementAccepted ? { type: "allow" } : { type: "notice", message: LOGIN_AGREEMENT_NOTICE };
}

export function smsSendFailureNotice(status: number) {
  if (status === 400) return "请输入有效的中国大陆手机号。";
  if (status === 429) return "请求过于频繁，请稍后再试。";
  if (status === 503) return "短信登录暂时不可用，请稍后重试。";
  return "短信登录暂时不可用，请稍后重试。";
}
