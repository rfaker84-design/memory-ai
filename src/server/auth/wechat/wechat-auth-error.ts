export type WeChatAuthErrorCode =
  | "WECHAT_AUTH_UNAVAILABLE"
  | "WECHAT_AUTH_STATE_INVALID"
  | "WECHAT_AUTH_CANCELLED"
  | "WECHAT_AUTH_FAILED"
  | "WECHAT_AUTH_ACCOUNT_DELETION_PENDING"
  | "WECHAT_AUTH_ACCOUNT_CONFLICT";

export class WeChatAuthError extends Error {
  constructor(public readonly code: WeChatAuthErrorCode) {
    super(code);
    this.name = "WeChatAuthError";
  }
}
