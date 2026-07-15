export type SmsVerificationSendInput = {
  phoneE164: string;
  code: string;
  expiresInMinutes: number;
};

export type SmsVerificationSendResult = {
  providerRequestId: string | null;
};

export interface SmsVerificationProvider {
  sendVerificationCode(
    input: SmsVerificationSendInput
  ): Promise<SmsVerificationSendResult>;
}

export type SmsProviderErrorCode =
  | "SMS_NOT_CONFIGURED"
  | "SMS_RATE_LIMITED"
  | "SMS_REJECTED"
  | "SMS_UNAVAILABLE";

export class SmsProviderError extends Error {
  constructor(public readonly code: SmsProviderErrorCode) {
    super(code);
    this.name = "SmsProviderError";
  }
}
