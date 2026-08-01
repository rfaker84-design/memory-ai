import {
  getStagingRuntimeConfiguration,
  type StagingRuntimeConfiguration,
} from "../../runtime/staging-contract";

import {
  SmsProviderError,
  type SmsVerificationProvider,
  type SmsVerificationSendInput,
  type SmsVerificationSendResult,
} from "./sms-verification-provider";

type Dependencies = {
  loadConfiguration?: () => StagingRuntimeConfiguration;
};

/**
 * This provider is selectable only by the production-built staging contract.
 * It never sends a network request and it never returns the fixed code to the
 * caller; AuthService still stores only the HMAC digest in PostgreSQL.
 */
export class StagingFixedSmsVerificationProvider implements SmsVerificationProvider {
  private readonly loadConfiguration: () => StagingRuntimeConfiguration;
  private configuration?: StagingRuntimeConfiguration;

  constructor(dependencies: Dependencies = {}) {
    this.loadConfiguration = dependencies.loadConfiguration ?? getStagingRuntimeConfiguration;
  }

  private configured(): StagingRuntimeConfiguration {
    this.configuration ??= this.loadConfiguration();
    return this.configuration;
  }

  assertConfigured(): void {
    this.configured();
  }

  createVerificationCode(): string {
    return this.configured().fixedSmsCode;
  }

  prepareVerificationCode(phoneE164: string): string {
    const configuration = this.configured();
    if (!this.isPermittedPhone(phoneE164, configuration)) {
      throw new SmsProviderError("SMS_REJECTED");
    }
    return configuration.fixedSmsCode;
  }

  async sendVerificationCode(input: SmsVerificationSendInput): Promise<SmsVerificationSendResult> {
    const configuration = this.configured();
    if (!this.isPermittedPhone(input.phoneE164, configuration)) {
      throw new SmsProviderError("SMS_REJECTED");
    }
    if (input.code !== configuration.fixedSmsCode) {
      throw new SmsProviderError("SMS_UNAVAILABLE");
    }
    return { providerRequestId: `staging-fixed:${input.phoneE164.slice(-4)}` };
  }

  private isPermittedPhone(phoneE164: string, configuration: StagingRuntimeConfiguration): boolean {
    return configuration.fixedSmsPhones.includes(phoneE164)
      || configuration.accountDeletionTestPhone === phoneE164;
  }
}
