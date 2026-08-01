import { randomUUID } from "node:crypto";

import type { SmsVerificationProvider } from "./sms/sms-verification-provider";
import type {
  AuthRepositoryPort,
  ChallengeVerifyResult,
} from "./auth-repository";
import { AUTH_POLICY, type AuthPolicy } from "./config";
import {
  digestVerificationCode,
  digestVerificationCodeCandidates,
  generateVerificationCode,
  hashPhoneCandidates,
  hashRequestIpCandidates,
} from "./crypto";
import { normalizeChinaPhone } from "./phone";
import { isProductCapabilityEnabled } from "../runtime/product-capability-gate";

export type SendCodeResult =
  | { status: "sent"; challengeId: string; resendAfter: string }
  | { status: "invalid_phone" }
  | { status: "rate_limited" };

export class AuthService {
  constructor(
    private readonly repository: AuthRepositoryPort,
    private readonly smsProvider: SmsVerificationProvider,
    private readonly policy: AuthPolicy = AUTH_POLICY,
    private readonly now: () => Date = () => new Date(),
    private readonly registrationsEnabled: () => boolean = () => isProductCapabilityEnabled("registration"),
  ) {}

  async sendCode(phoneInput: unknown, requestIp: string): Promise<SendCodeResult> {
    const phoneE164 = normalizeChinaPhone(phoneInput);
    if (!phoneE164) return { status: "invalid_phone" };

    this.smsProvider.assertConfigured?.();
    const now = this.now();
    const challengeId = randomUUID();
    const code = this.smsProvider.prepareVerificationCode?.(phoneE164)
      ?? this.smsProvider.createVerificationCode?.()
      ?? generateVerificationCode();
    const phoneHashCandidates = hashPhoneCandidates(phoneE164);
    const requestIpHashCandidates = hashRequestIpCandidates(requestIp);
    const phoneHash = phoneHashCandidates[0]!;
    const created = await this.repository.createChallenge({
      challengeId,
      phoneHash,
      phoneHashCandidates,
      codeDigest: digestVerificationCode(challengeId, code),
      purpose: "sign_in",
      expiresAt: new Date(now.getTime() + this.policy.codeTtlSeconds * 1000),
      resendAfter: new Date(now.getTime() + this.policy.resendSeconds * 1000),
      requestIpHash: requestIpHashCandidates[0]!,
      requestIpHashCandidates,
    }, this.policy);
    if (created === "rate_limited") return { status: "rate_limited" };

    try {
      const sent = await this.smsProvider.sendVerificationCode({
        phoneE164,
        code,
        expiresInMinutes: Math.ceil(this.policy.codeTtlSeconds / 60),
      });
      await this.repository.setProviderRequestId(challengeId, sent.providerRequestId);
    } catch (error) {
      await this.repository.discardChallenge(challengeId);
      throw error;
    }

    return {
      status: "sent",
      challengeId,
      resendAfter: new Date(now.getTime() + this.policy.resendSeconds * 1000).toISOString(),
    };
  }

  async verifyCode(input: {
    phone: unknown;
    code: string;
    challengeId: string;
  }): Promise<ChallengeVerifyResult> {
    const phoneE164 = normalizeChinaPhone(input.phone);
    if (!phoneE164 || !/^[0-9a-f-]{36}$/i.test(input.challengeId) || !/^\d{6}$/.test(input.code)) {
      return { status: "invalid" };
    }
    const phoneHashCandidates = hashPhoneCandidates(phoneE164);
    const candidateDigests = digestVerificationCodeCandidates(input.challengeId, input.code);
    const phoneHash = phoneHashCandidates[0]!;
    return this.repository.verifyAndConsume({
      challengeId: input.challengeId,
      phoneHash,
      phoneHashCandidates,
      candidateDigest: candidateDigests[0]!,
      candidateDigests,
      externalUserId: `phone:${phoneHash}`,
      externalUserIdCandidates: phoneHashCandidates.map((candidate) => `phone:${candidate}`),
      allowNewRegistration: this.registrationsEnabled(),
      now: this.now(),
    });
  }
}
