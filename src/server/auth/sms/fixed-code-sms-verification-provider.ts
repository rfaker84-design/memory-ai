import { loadFixedCodeSmsConfig, type FixedCodeSmsConfig } from "./fixed-code-sms-config";
import {
  SmsProviderError,
  type SmsVerificationProvider,
  type SmsVerificationSendInput,
  type SmsVerificationSendResult,
} from "./sms-verification-provider";

type Dependencies = {
  loadConfig?: () => FixedCodeSmsConfig;
};

export class FixedCodeSmsVerificationProvider implements SmsVerificationProvider {
  private readonly loadConfig: () => FixedCodeSmsConfig;
  private config?: FixedCodeSmsConfig;

  constructor(dependencies: Dependencies = {}) {
    this.loadConfig = dependencies.loadConfig ?? loadFixedCodeSmsConfig;
  }

  assertConfigured(): void {
    this.config ??= this.loadConfig();
  }

  async sendVerificationCode(
    input: SmsVerificationSendInput
  ): Promise<SmsVerificationSendResult> {
    this.assertConfigured();
    const config = this.config;
    if (
      !config
      || input.code !== config.code
      || !config.allowedPhones.has(input.phoneE164)
    ) {
      throw new SmsProviderError("SMS_REJECTED");
    }
    return { providerRequestId: "fixed-code-local-test" };
  }
}
