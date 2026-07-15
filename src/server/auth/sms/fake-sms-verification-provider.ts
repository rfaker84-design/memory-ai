import type {
  SmsVerificationProvider,
  SmsVerificationSendInput,
  SmsVerificationSendResult,
} from "./sms-verification-provider";

export class FakeSmsVerificationProvider implements SmsVerificationProvider {
  readonly sent: SmsVerificationSendInput[] = [];

  constructor(
    private readonly result: SmsVerificationSendResult = {
      providerRequestId: "fake-request-id",
    }
  ) {}

  async sendVerificationCode(
    input: SmsVerificationSendInput
  ): Promise<SmsVerificationSendResult> {
    this.sent.push({ ...input });
    return this.result;
  }
}
