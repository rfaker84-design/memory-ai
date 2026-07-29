import { sms } from "tencentcloud-sdk-nodejs-sms";
import type {
  SendSmsRequest,
  SendSmsResponse,
} from "tencentcloud-sdk-nodejs-sms/tencentcloud/services/sms/v20210111/sms_models";

import { loadFixedCodeSmsConfig } from "./fixed-code-sms-config";
import { FixedCodeSmsVerificationProvider } from "./fixed-code-sms-verification-provider";
import {
  SmsProviderError,
  type SmsVerificationProvider,
  type SmsVerificationSendInput,
  type SmsVerificationSendResult,
} from "./sms-verification-provider";
import { getStagingRuntimeConfiguration, isStagingRuntime } from "../../runtime/staging-contract";
import { StagingFixedSmsVerificationProvider } from "./staging-fixed-sms-verification-provider";

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

const SMS_ENVIRONMENT_NAMES = [
  "TENCENT_SMS_SECRET_ID",
  "TENCENT_SMS_SECRET_KEY",
  "TENCENT_SMS_REGION",
  "TENCENT_SMS_SDK_APP_ID",
  "TENCENT_SMS_SIGN_NAME",
  "TENCENT_SMS_TEMPLATE_ID",
] as const;

function configurationError(): never {
  throw new SmsProviderError("SMS_PROVIDER_CONFIGURATION_INVALID");
}

function required(environment: NodeJS.ProcessEnv, name: (typeof SMS_ENVIRONMENT_NAMES)[number]): string {
  const raw = environment[name];
  const value = raw?.trim();
  if (!value || raw !== value) configurationError();
  return value;
}

export function loadTencentSmsConfig(environment: NodeJS.ProcessEnv = process.env): TencentSmsConfig {
  const config = {
    secretId: required(environment, "TENCENT_SMS_SECRET_ID"),
    secretKey: required(environment, "TENCENT_SMS_SECRET_KEY"),
    region: required(environment, "TENCENT_SMS_REGION"),
    sdkAppId: required(environment, "TENCENT_SMS_SDK_APP_ID"),
    signName: required(environment, "TENCENT_SMS_SIGN_NAME"),
    templateId: required(environment, "TENCENT_SMS_TEMPLATE_ID"),
  };
  if (
    !/^[a-z]+(?:-[a-z0-9]+)+$/.test(config.region)
    || !/^\d+$/.test(config.sdkAppId)
    || !/^\d+$/.test(config.templateId)
  ) configurationError();
  return config;
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

  assertConfigured(): void {
    this.config ??= this.loadConfig();
  }

  private resolveRuntime(): { config: TencentSmsConfig; client: SmsApiClient } {
    this.assertConfigured();
    const config = this.config;
    if (!config) configurationError();
    this.client ??= this.createClient(config);
    return { config, client: this.client };
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
let fixedCodeProvider: SmsVerificationProvider | undefined;

export function getSmsVerificationProvider(
  environment: NodeJS.ProcessEnv = process.env
): SmsVerificationProvider {
  if (isStagingRuntime(environment)) {
    return new StagingFixedSmsVerificationProvider({
      loadConfiguration: () => getStagingRuntimeConfiguration(environment),
    });
  }

  const provider = environment.AUTH_SMS_PROVIDER?.trim() || "tencent";
  if (provider === "fixed") {
    if (environment.NODE_ENV === "production") {
      throw new SmsProviderError("SMS_PROVIDER_CONFIGURATION_INVALID");
    }
    if (environment !== process.env) {
      return new FixedCodeSmsVerificationProvider({
        loadConfig: () => loadFixedCodeSmsConfig(environment),
      });
    }
    fixedCodeProvider ??= new FixedCodeSmsVerificationProvider();
    return fixedCodeProvider;
  }
  if (provider !== "tencent") {
    throw new SmsProviderError("SMS_PROVIDER_CONFIGURATION_INVALID");
  }
  productionProvider ??= new TencentSmsVerificationProvider();
  return productionProvider;
}
