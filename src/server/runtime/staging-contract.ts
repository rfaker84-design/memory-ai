export const STAGING_APP_ORIGIN = "https://app.staging.yijianmemory.cn";
export const STAGING_API_ORIGIN = "https://api.staging.yijianmemory.cn";

const MIN_STAGING_ACCESS_TOKEN_BYTES = 48;
const MIN_STAGING_MEDIA_SIGNING_SECRET_BYTES = 32;
const MAX_STAGING_ACCESS_PREVIOUS_TOKEN_WINDOW_SECONDS = 24 * 60 * 60;
const MAX_STAGING_MEDIA_PREVIOUS_SECRET_WINDOW_SECONDS = 900;

export class StagingRuntimeConfigurationError extends Error {
  constructor(public readonly code: string) {
    super(code);
    this.name = "StagingRuntimeConfigurationError";
  }
}

export type StagingRuntimeConfiguration = Readonly<{
  databaseName: string;
  accessToken: string;
  previousAccessToken: string | null;
  fixedSmsCode: string;
  fixedSmsPhones: readonly [string, string];
  /** A disposable identity accepted only while the guarded deletion test is enabled. */
  accountDeletionTestPhone: string | null;
  mediaRoot: string;
  mediaSigningSecret: string;
  previousMediaSigningSecret: string | null;
}>;

function required(environment: NodeJS.ProcessEnv, name: string): string {
  const raw = environment[name];
  const value = raw?.trim();
  if (!value || raw !== value) {
    throw new StagingRuntimeConfigurationError(`${name}_NOT_CONFIGURED`);
  }
  return value;
}

function requiredSecret(
  environment: NodeJS.ProcessEnv,
  name: "STAGING_ACCESS_TOKEN" | "STAGING_MEDIA_SIGNING_SECRET",
  minimumBytes: number,
): string {
  const value = required(environment, name);
  if (new TextEncoder().encode(value).length < minimumBytes) {
    throw new StagingRuntimeConfigurationError(`${name}_NOT_CONFIGURED`);
  }
  return value;
}

function requireExact(environment: NodeJS.ProcessEnv, name: string, expected: string): void {
  if (required(environment, name) !== expected) {
    throw new StagingRuntimeConfigurationError(`${name}_INVALID`);
  }
}

function parseStagingDatabaseName(environment: NodeJS.ProcessEnv): string {
  const name = required(environment, "STAGING_DATABASE_NAME");
  if (!/^[a-z][a-z0-9_]{2,62}$/i.test(name) || !name.toLowerCase().includes("staging")) {
    throw new StagingRuntimeConfigurationError("STAGING_DATABASE_NAME_INVALID");
  }

  const databaseUrl = required(environment, "DATABASE_URL");
  try {
    const parsed = new URL(databaseUrl);
    const urlName = decodeURIComponent(parsed.pathname.replace(/^\//, ""));
    if (
      (parsed.protocol !== "postgres:" && parsed.protocol !== "postgresql:")
      || !urlName
      || urlName !== name
    ) {
      throw new Error("invalid staging database");
    }
  } catch {
    throw new StagingRuntimeConfigurationError("STAGING_DATABASE_URL_INVALID");
  }
  return name;
}

function parseFixedPhones(environment: NodeJS.ProcessEnv): readonly [string, string] {
  const phones = required(environment, "STAGING_FIXED_SMS_PHONES").split(",");
  if (
    phones.length !== 2
    || new Set(phones).size !== 2
    || phones.some((phone) => !/^\+861[3-9]\d{9}$/.test(phone))
  ) {
    throw new StagingRuntimeConfigurationError("STAGING_FIXED_SMS_PHONES_INVALID");
  }
  return [phones[0], phones[1]];
}

function parseAccountDeletionTestPhone(
  environment: NodeJS.ProcessEnv,
  fixedSmsPhones: readonly [string, string],
): string | null {
  const phone = environment.STAGING_ACCOUNT_DELETION_TEST_PHONE;
  if (!phone) return null;
  if (
    phone !== phone.trim()
    || !/^\+861[3-9]\d{9}$/.test(phone)
    || fixedSmsPhones.includes(phone)
    || environment.ACCOUNT_DELETION_ENABLED !== "true"
    || environment.AUTH_SESSION_REVOCATION_ENFORCED !== "true"
  ) {
    throw new StagingRuntimeConfigurationError("STAGING_ACCOUNT_DELETION_TEST_PHONE_INVALID");
  }
  return phone;
}

function parseMediaRoot(environment: NodeJS.ProcessEnv): string {
  const root = required(environment, "STAGING_MEDIA_ROOT");
  if (!root.includes("staging")) {
    throw new StagingRuntimeConfigurationError("STAGING_MEDIA_ROOT_INVALID");
  }
  return root;
}

function parsePreviousMediaSigningSecret(environment: NodeJS.ProcessEnv, now: Date): string | null {
  const previous = environment.STAGING_MEDIA_SIGNING_SECRET_PREVIOUS;
  const validUntil = environment.STAGING_MEDIA_SIGNING_SECRET_PREVIOUS_VALID_UNTIL;
  if (!previous && !validUntil) return null;
  if (!previous || !validUntil || previous !== previous.trim()
    || new TextEncoder().encode(previous).length < MIN_STAGING_MEDIA_SIGNING_SECRET_BYTES
    || previous === environment.STAGING_MEDIA_SIGNING_SECRET) {
    throw new StagingRuntimeConfigurationError("STAGING_MEDIA_SIGNING_SECRET_PREVIOUS_INVALID");
  }
  const expiry = Date.parse(validUntil);
  const remainingMilliseconds = expiry - now.getTime();
  if (!Number.isFinite(expiry) || remainingMilliseconds <= 0
    || remainingMilliseconds > MAX_STAGING_MEDIA_PREVIOUS_SECRET_WINDOW_SECONDS * 1000) {
    throw new StagingRuntimeConfigurationError("STAGING_MEDIA_SIGNING_SECRET_PREVIOUS_INVALID");
  }
  return previous;
}

function parsePreviousAccessToken(environment: NodeJS.ProcessEnv, now: Date): string | null {
  const previous = environment.STAGING_ACCESS_TOKEN_PREVIOUS;
  const validUntil = environment.STAGING_ACCESS_TOKEN_PREVIOUS_VALID_UNTIL;
  if (!previous && !validUntil) return null;
  if (!previous || !validUntil || previous !== previous.trim()
    || new TextEncoder().encode(previous).length < MIN_STAGING_ACCESS_TOKEN_BYTES
    || previous === environment.STAGING_ACCESS_TOKEN) {
    throw new StagingRuntimeConfigurationError("STAGING_ACCESS_TOKEN_PREVIOUS_INVALID");
  }
  const expiry = Date.parse(validUntil);
  const remainingMilliseconds = expiry - now.getTime();
  if (!Number.isFinite(expiry) || remainingMilliseconds <= 0
    || remainingMilliseconds > MAX_STAGING_ACCESS_PREVIOUS_TOKEN_WINDOW_SECONDS * 1000) {
    throw new StagingRuntimeConfigurationError("STAGING_ACCESS_TOKEN_PREVIOUS_INVALID");
  }
  return previous;
}

/** True only for the intentional production-built staging runtime. */
export function isStagingRuntime(environment: NodeJS.ProcessEnv = process.env): boolean {
  return environment.NODE_ENV === "production" && environment.DEPLOYMENT_ENV === "staging";
}

export function getStagingRuntimeConfiguration(
  environment: NodeJS.ProcessEnv = process.env,
  now: Date = new Date(),
): StagingRuntimeConfiguration {
  if (!isStagingRuntime(environment)) {
    throw new StagingRuntimeConfigurationError("STAGING_RUNTIME_NOT_ENABLED");
  }

  requireExact(environment, "AUTH_ALLOWED_ORIGIN", STAGING_APP_ORIGIN);
  requireExact(environment, "STAGING_DATABASE_ISOLATION", "isolated");
  requireExact(environment, "STAGING_DATA_SOURCE", "empty");
  requireExact(environment, "LLM_PROVIDER", "mock");
  requireExact(environment, "TTS_PROVIDER", "mock");

  const fixedSmsCode = required(environment, "STAGING_FIXED_SMS_CODE");
  if (!/^\d{6}$/.test(fixedSmsCode)) {
    throw new StagingRuntimeConfigurationError("STAGING_FIXED_SMS_CODE_INVALID");
  }

  const fixedSmsPhones = parseFixedPhones(environment);
  return Object.freeze({
    databaseName: parseStagingDatabaseName(environment),
    accessToken: requiredSecret(environment, "STAGING_ACCESS_TOKEN", MIN_STAGING_ACCESS_TOKEN_BYTES),
    previousAccessToken: parsePreviousAccessToken(environment, now),
    fixedSmsCode,
    fixedSmsPhones,
    accountDeletionTestPhone: parseAccountDeletionTestPhone(environment, fixedSmsPhones),
    mediaRoot: parseMediaRoot(environment),
    mediaSigningSecret: requiredSecret(
      environment,
      "STAGING_MEDIA_SIGNING_SECRET",
      MIN_STAGING_MEDIA_SIGNING_SECRET_BYTES,
    ),
    previousMediaSigningSecret: parsePreviousMediaSigningSecret(environment, now),
  });
}

export function assertStagingRuntimeConfiguration(environment: NodeJS.ProcessEnv = process.env): void {
  getStagingRuntimeConfiguration(environment);
}

/**
 * Middleware runs in the Edge-compatible request layer, so this uses a fixed
 * work loop instead of Node-only crypto. The expected token itself is never
 * returned or logged.
 */
function constantTimeEquals(expected: string, candidate: string): boolean {
  const encoder = new TextEncoder();
  const expectedBytes = encoder.encode(expected);
  const candidateBytes = encoder.encode(candidate);
  const length = Math.max(expectedBytes.length, candidateBytes.length);
  let difference = expectedBytes.length ^ candidateBytes.length;
  for (let index = 0; index < length; index += 1) {
    difference |= (expectedBytes[index] ?? 0) ^ (candidateBytes[index] ?? 0);
  }
  return difference === 0;
}

export function hasValidStagingAccessToken(
  candidate: string | null,
  environment: NodeJS.ProcessEnv = process.env,
  now: Date = new Date(),
): boolean {
  if (!candidate) return false;
  const configuration = getStagingRuntimeConfiguration(environment, now);
  return constantTimeEquals(configuration.accessToken, candidate)
    || (configuration.previousAccessToken !== null
      && constantTimeEquals(configuration.previousAccessToken, candidate));
}
