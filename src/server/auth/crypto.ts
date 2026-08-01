import {
  createHmac,
  randomInt,
  timingSafeEqual,
} from "node:crypto";

import { loadFixedCodeSmsConfig } from "./sms/fixed-code-sms-config";

export class AuthConfigurationError extends Error {
  constructor(public readonly code: string) {
    super(code);
    this.name = "AuthConfigurationError";
  }
}

export type SessionSigningKey = Readonly<{
  id: string;
  secret: Uint8Array;
}>;

export type SessionSigningKeyRing = Readonly<{
  current: SessionSigningKey;
  previous: SessionSigningKey | null;
}>;

function requiredSecret(name: "AUTH_VERIFICATION_PEPPER" | "SESSION_SECRET"): string {
  const value = process.env[name];
  if (!value || Buffer.byteLength(value, "utf8") < 32) {
    throw new AuthConfigurationError(`${name}_NOT_CONFIGURED`);
  }
  return value;
}

function hmacHex(secret: string, domain: string, value: string): string {
  return createHmac("sha256", secret).update(`${domain}\0${value}`).digest("hex");
}

export function hashPhone(phoneE164: string): string {
  return hmacHex(requiredSecret("AUTH_VERIFICATION_PEPPER"), "phone", phoneE164);
}

export function hashRequestIp(ip: string): string {
  return hmacHex(requiredSecret("AUTH_VERIFICATION_PEPPER"), "request-ip", ip);
}

export function digestVerificationCode(challengeId: string, code: string): string {
  return hmacHex(
    requiredSecret("AUTH_VERIFICATION_PEPPER"),
    "verification-code",
    `${challengeId}:${code}`
  );
}

export function verificationDigestsEqual(stored: string, candidate: string): boolean {
  const storedBuffer = Buffer.from(stored, "hex");
  const candidateBuffer = Buffer.from(candidate, "hex");
  return storedBuffer.length === candidateBuffer.length
    && storedBuffer.length === 32
    && timingSafeEqual(storedBuffer, candidateBuffer);
}

export function generateVerificationCode(
  environment: NodeJS.ProcessEnv = process.env
): string {
  if (environment.AUTH_SMS_PROVIDER?.trim() === "fixed") {
    return loadFixedCodeSmsConfig(environment).code;
  }
  return randomInt(0, 1_000_000).toString().padStart(6, "0");
}

export function sessionSecret(): Uint8Array {
  return new TextEncoder().encode(requiredSecret("SESSION_SECRET"));
}

function sessionKeyId(environment: NodeJS.ProcessEnv, name: "SESSION_SECRET_KID" | "SESSION_SECRET_PREVIOUS_KID", fallback?: string): string {
  const value = environment[name]?.trim() || fallback;
  if (!value || !/^[A-Za-z0-9_-]{1,32}$/.test(value)) {
    throw new AuthConfigurationError(`${name}_INVALID`);
  }
  return value;
}

/**
 * One optional previous key is permitted only during a bounded overlap. New
 * tokens always use `current`; callers may verify the previous key until its
 * declared cutoff. Secret values are never exposed by this resolver.
 */
export function sessionSigningKeyRing(
  environment: NodeJS.ProcessEnv = process.env,
  now: Date = new Date(),
): SessionSigningKeyRing {
  const current: SessionSigningKey = Object.freeze({
    id: sessionKeyId(environment, "SESSION_SECRET_KID", "current"),
    secret: new TextEncoder().encode(requiredSecret("SESSION_SECRET")),
  });
  const previousSecret = environment.SESSION_SECRET_PREVIOUS;
  const previousKeyId = environment.SESSION_SECRET_PREVIOUS_KID;
  const previousValidUntil = environment.SESSION_SECRET_PREVIOUS_VALID_UNTIL;
  const hasPrevious = Boolean(previousSecret || previousKeyId || previousValidUntil);
  if (!hasPrevious) return Object.freeze({ current, previous: null });

  if (!previousSecret || !previousKeyId || !previousValidUntil) {
    throw new AuthConfigurationError("SESSION_SECRET_PREVIOUS_CONFIGURATION_INVALID");
  }
  if (previousSecret !== previousSecret.trim() || Buffer.byteLength(previousSecret, "utf8") < 32) {
    throw new AuthConfigurationError("SESSION_SECRET_PREVIOUS_CONFIGURATION_INVALID");
  }
  const previousId = sessionKeyId(environment, "SESSION_SECRET_PREVIOUS_KID");
  const validUntilMilliseconds = Date.parse(previousValidUntil);
  if (!Number.isFinite(validUntilMilliseconds) || validUntilMilliseconds <= now.getTime()) {
    throw new AuthConfigurationError("SESSION_SECRET_PREVIOUS_CONFIGURATION_INVALID");
  }
  if (previousId === current.id || previousSecret === environment.SESSION_SECRET) {
    throw new AuthConfigurationError("SESSION_SECRET_PREVIOUS_CONFIGURATION_INVALID");
  }
  return Object.freeze({
    current,
    previous: Object.freeze({ id: previousId, secret: new TextEncoder().encode(previousSecret) }),
  });
}
