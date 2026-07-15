import { sms } from "tencentcloud-sdk-nodejs-sms";
import type {
  SendSmsRequest,
  SendSmsResponse,
} from "tencentcloud-sdk-nodejs-sms/tencentcloud/services/sms/v20210111/sms_models";

import {
  SmsProviderError,
  type SmsVerificationProvider,
  type SmsVerificationSendInput,
  type SmsVerificationSendResult,
} from "./sms-verification-provider";

const TencentSmsClient = sms.v20210111.Client;

type SmsApiClient = {
  SendSms(request: SendSmsRequest): Promise<SendSmsResponse>;
};

type TencentSmsConfig = {
  secretId: string;
  secretKey: string;
  region: string;
  sdkAppId: string;
  signName: string;
  templateId: string;
};

type TencentSmsDependencies = {
  loadConfig?: () => TencentSmsConfig;
  createClient?: (config: TencentSmsConfig) => SmsApiClient;
};

function required(name: keyof NodeJS.ProcessEnv): string {
  const value = process.env[name]?.trim();
  if (!value) throw new SmsProviderError("SMS_NOT_CONFIGURED");
  return value;
}

function loadTencentSmsConfig(): TencentSmsConfig {
  return {
    secretId: required("TENCENT_SMS_SECRET_ID"),
    secretKey: required("TENCENT_SMS_SECRET_KEY"),
    region: required("TENCENT_SMS_REGION"),
    sdkAppId: required("TENCENT_SMS_SDK_APP_ID"),
    signName: required("TENCENT_SMS_SIGN_NAME"),
    templateId: required("TENCENT_SMS_TEMPLATE_ID"),
  };
}

function createTencentSmsClient(config: TencentSmsConfig): SmsApiClient {
  return new TencentSmsClient({
    credential: {
      secretId: config.secretId,
      secretKey: config.secretKey,
    },
    region: config.region,
    profile: {
      httpProfile: {
        endpoint: "sms.tencentcloudapi.com",
      },
    },
  });
}

function mapTencentError(error: unknown): SmsProviderError {
  const code =
    typeof error === "object" && error !== null && "code" in error
      ? String(error.code)
      : "";

  if (/LimitExceeded|RequestLimitExceeded|FrequencyLimit/i.test(code)) {
    return new SmsProviderError("SMS_RATE_LIMITED");
  }
  if (/AuthFailure|InvalidParameter|UnauthorizedOperation/i.test(code)) {
    return new SmsProviderError("SMS_REJECTED");
  }
  return new SmsProviderError("SMS_UNAVAILABLE");
}

export class TencentSmsVerificationProvider
  implements SmsVerificationProvider
{
  private readonly loadConfig: () => TencentSmsConfig;
  private readonly createClient: (config: TencentSmsConfig) => SmsApiClient;
  private config?: TencentSmsConfig;
  private client?: SmsApiClient;

  constructor(dependencies: TencentSmsDependencies = {}) {
    this.loadConfig = dependencies.loadConfig ?? loadTencentSmsConfig;
    this.createClient = dependencies.createClient ?? createTencentSmsClient;
  }

  private resolveRuntime(): { config: TencentSmsConfig; client: SmsApiClient } {
    this.config ??= this.loadConfig();
    this.client ??= this.createClient(this.config);
    return { config: this.config, client: this.client };
  }

  async sendVerificationCode(
    input: SmsVerificationSendInput
  ): Promise<SmsVerificationSendResult> {
    try {
      const { config, client } = this.resolveRuntime();
      const response = await client.SendSms({
        PhoneNumberSet: [input.phoneE164],
        SmsSdkAppId: config.sdkAppId,
        SignName: config.signName,
        TemplateId: config.templateId,
        TemplateParamSet: [input.code, String(input.expiresInMinutes)],
      });
      const status = response.SendStatusSet?.[0];

      if (status?.Code !== "Ok") {
        if (/LimitExceeded|FrequencyLimit/i.test(status?.Code ?? "")) {
          throw new SmsProviderError("SMS_RATE_LIMITED");
        }
        throw new SmsProviderError("SMS_REJECTED");
      }

      return { providerRequestId: response.RequestId ?? null };
    } catch (error) {
      if (error instanceof SmsProviderError) throw error;
      throw mapTencentError(error);
    }
  }
}

let productionProvider: SmsVerificationProvider | undefined;

export function getSmsVerificationProvider(): SmsVerificationProvider {
  productionProvider ??= new TencentSmsVerificationProvider();
  return productionProvider;
}
