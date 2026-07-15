export type AuthPolicy = {
  codeTtlSeconds: number;
  resendSeconds: number;
  maxAttempts: number;
  phoneHourlyLimit: number;
  phoneDailyLimit: number;
  ipHourlyLimit: number;
  sessionTtlSeconds: number;
  cleanupRetentionDays: number;
  cleanupBatchSize: number;
};

export const AUTH_POLICY: Readonly<AuthPolicy> = Object.freeze({
  codeTtlSeconds: 5 * 60,
  resendSeconds: 60,
  maxAttempts: 5,
  phoneHourlyLimit: 5,
  phoneDailyLimit: 10,
  ipHourlyLimit: 20,
  sessionTtlSeconds: 7 * 24 * 60 * 60,
  cleanupRetentionDays: 7,
  cleanupBatchSize: 200,
});

export const AUTH_SESSION_COOKIE = "__Host-memoryai_session";
export const AUTH_SESSION_ISSUER = "memoryai";
export const AUTH_SESSION_AUDIENCE = "memoryai-web";
