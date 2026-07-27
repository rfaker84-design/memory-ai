import { SmsProviderError } from "./sms-verification-provider";

export type FixedCodeSmsConfig = {
  code: string;
  allowedPhones: ReadonlySet<string>;
};

function configurationError(): never {
  throw new SmsProviderError("SMS_PROVIDER_CONFIGURATION_INVALID");
}

export function loadFixedCodeSmsConfig(
  environment: NodeJS.ProcessEnv = process.env
): FixedCodeSmsConfig {
  if (environment.NODE_ENV === "production") configurationError();
  const code = environment.AUTH_FIXED_SMS_CODE?.trim();
  if (!code || !/^\d{6}$/.test(code)) configurationError();

  const phones = environment.AUTH_FIXED_SMS_ALLOWED_PHONES
    ?.split(",")
    .map((phone) => phone.trim())
    .filter(Boolean);
  if (
    !phones
    || phones.length !== 2
    || new Set(phones).size !== phones.length
    || phones.some((phone) => !/^\+861\d{10}$/.test(phone))
  ) {
    configurationError();
  }

  return {
    code,
    allowedPhones: new Set(phones),
  };
}
