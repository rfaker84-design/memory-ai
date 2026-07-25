import type { AuthUser } from "../auth-repository";
import {
  digestWeChatState,
  generateWeChatState,
  hashWeChatIdentitySubjects,
} from "./wechat-auth-crypto";
import { WeChatAuthError } from "./wechat-auth-error";
import type { WeChatAuthProviderPort } from "./wechat-auth-provider";
import type { WeChatAuthRepositoryPort } from "./wechat-auth-repository";

const STATE_TTL_MS = 5 * 60 * 1000;

export class WeChatAuthService {
  constructor(
    private readonly repository: WeChatAuthRepositoryPort,
    private readonly provider: WeChatAuthProviderPort,
    private readonly now: () => Date = () => new Date(),
    private readonly createStateValue: () => string = generateWeChatState,
  ) {}

  async begin(): Promise<{ authorizationUrl: string }> {
    const state = this.createStateValue();
    const now = this.now();
    const created = await this.repository.createState({
      stateDigest: digestWeChatState(state),
      expiresAt: new Date(now.getTime() + STATE_TTL_MS),
    });
    if (created !== "created") {
      throw new WeChatAuthError("WECHAT_AUTH_FAILED");
    }
    return { authorizationUrl: this.provider.authorizationUrl(state) };
  }

  async complete(input: {
    state: string;
    code: string;
  }): Promise<AuthUser> {
    if (!/^[A-Za-z0-9_-]{1,256}$/.test(input.code)) {
      throw new WeChatAuthError("WECHAT_AUTH_FAILED");
    }
    await this.consume(input.state);
    let identity;
    try {
      identity = await this.provider.exchangeCode(input.code);
    } catch (error) {
      if (error instanceof WeChatAuthError) throw error;
      throw new WeChatAuthError("WECHAT_AUTH_FAILED");
    }

    const resolved = await this.repository.resolveIdentity({
      ...hashWeChatIdentitySubjects({
        appId: this.provider.appId,
        openId: identity.openId,
        unionId: identity.unionId,
        identityPepper: this.provider.identityPepper,
      }),
    });
    if (resolved.status === "conflict") {
      throw new WeChatAuthError("WECHAT_AUTH_ACCOUNT_CONFLICT");
    }
    return resolved.user;
  }

  async cancel(state: string): Promise<never> {
    await this.consume(state);
    throw new WeChatAuthError("WECHAT_AUTH_CANCELLED");
  }

  async fail(state: string): Promise<never> {
    await this.consume(state);
    throw new WeChatAuthError("WECHAT_AUTH_FAILED");
  }

  private async consume(
    rawState: string,
  ): Promise<void> {
    if (!/^[A-Za-z0-9_-]{43}$/.test(rawState)) {
      throw new WeChatAuthError("WECHAT_AUTH_STATE_INVALID");
    }
    const consumed = await this.repository.consumeState({
      stateDigest: digestWeChatState(rawState),
      now: this.now(),
    });
    if (!consumed) throw new WeChatAuthError("WECHAT_AUTH_STATE_INVALID");
  }
}
