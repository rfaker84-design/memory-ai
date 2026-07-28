import { getStagingRuntimeConfiguration } from "../../runtime/staging-contract";

import {
  SmsProviderError,
  type SmsVerificationProvider,
  type SmsVerificationSendInput,
  type SmsVerificationSendResult,
} from "./sms-verification-provider";

/**
 * This provider is selectable only by the production-built staging contract.
 * It never sends a network request and it never returns the fixed code to the
 * caller; AuthService still stores only the HMAC digest in PostgreSQL.
 */
export class StagingFixedSmsVerificationProvider implements SmsVerificationProvider {
  assertConfigured(): void {
    getStagingRuntimeConfiguration();
  }

  createVerificationCode(): string {
    return getStagingRuntimeConfiguration().fixedSmsCode;
  }

  async sendVerificationCode(input: SmsVerificationSendInput): Promise<SmsVerificationSendResult> {
    const configuration = getStagingRuntimeConfiguration();
    if (!configuration.fixedSmsPhones.includes(input.phoneE164)) {
      throw new SmsProviderError("SMS_REJECTED");
    }
    if (input.code !== configuration.fixedSmsCode) {
      throw new SmsProviderError("SMS_UNAVAILABLE");
    }
    return { providerRequestId: `staging-fixed:${input.phoneE164.slice(-4)}` };
  }
}
