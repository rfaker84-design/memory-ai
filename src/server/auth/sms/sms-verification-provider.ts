export type SmsVerificationSendInput = {
  phoneE164: string;
  code: string;
  expiresInMinutes: number;
};

export type SmsVerificationSendResult = {
  providerRequestId: string | null;
};

export interface SmsVerificationProvider {
  assertConfigured?(): void;
  createVerificationCode?(): string;
  sendVerificationCode(
    input: SmsVerificationSendInput
  ): Promise<SmsVerificationSendResult>;
}

export type SmsProviderErrorCode =
  | "SMS_PROVIDER_CONFIGURATION_INVALID"
  | "SMS_RATE_LIMITED"
  | "SMS_REJECTED"
  | "SMS_UNAVAILABLE";

export class SmsProviderError extends Error {
  constructor(public readonly code: SmsProviderErrorCode) {
    super(code);
    this.name = "SmsProviderError";
  }
}
