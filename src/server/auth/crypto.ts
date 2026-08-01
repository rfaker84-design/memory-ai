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

export type VerificationPepper = Readonly<{ id: string; secret: string }>;
export type VerificationPepperKeyRing = Readonly<{ current: VerificationPepper; previous: VerificationPepper | null }>;
const MINIMUM_VERIFICATION_PEPPER_OVERLAP_MS = (7 * 24 * 60 * 60 + 30) * 1000;
const MAXIMUM_VERIFICATION_PEPPER_OVERLAP_MS = 180 * 24 * 60 * 60 * 1000;
// An old session key is needed only until the last pre-rotation Session can
// expire, including the JWT clock tolerance. Longer overlap would turn a
// planned rotation into an indefinite second signing authority.
const MAXIMUM_SESSION_SECRET_OVERLAP_MS = (7 * 24 * 60 * 60 + 30) * 1000;

function requiredSecret(name: "AUTH_VERIFICATION_PEPPER" | "SESSION_SECRET", environment: NodeJS.ProcessEnv = process.env): string {
  const value = environment[name];
  if (!value || Buffer.byteLength(value, "utf8") < 32) {
    throw new AuthConfigurationError(`${name}_NOT_CONFIGURED`);
  }
  return value;
}

function hmacHex(secret: string, domain: string, value: string): string {
  return createHmac("sha256", secret).update(`${domain}\0${value}`).digest("hex");
}

function verificationPepperId(environment: NodeJS.ProcessEnv, name: "AUTH_VERIFICATION_PEPPER_KID" | "AUTH_VERIFICATION_PEPPER_PREVIOUS_KID", fallback?: string): string {
  const value = environment[name]?.trim() || fallback;
  if (!value || !/^[A-Za-z0-9_-]{1,32}$/.test(value)) throw new AuthConfigurationError(`${name}_INVALID`);
  return value;
}

export function verificationPepperKeyRing(environment: NodeJS.ProcessEnv = process.env, now: Date = new Date()): VerificationPepperKeyRing {
  const current = Object.freeze({ id: verificationPepperId(environment, "AUTH_VERIFICATION_PEPPER_KID", "current"), secret: requiredSecret("AUTH_VERIFICATION_PEPPER", environment) });
  const previousSecret = environment.AUTH_VERIFICATION_PEPPER_PREVIOUS;
  const previousId = environment.AUTH_VERIFICATION_PEPPER_PREVIOUS_KID;
  const previousValidUntil = environment.AUTH_VERIFICATION_PEPPER_PREVIOUS_VALID_UNTIL;
  if (!previousSecret && !previousId && !previousValidUntil) return Object.freeze({ current, previous: null });
  if (!previousSecret || !previousId || !previousValidUntil || previousSecret !== previousSecret.trim()
    || Buffer.byteLength(previousSecret, "utf8") < 32 || previousSecret === current.secret) {
    throw new AuthConfigurationError("AUTH_VERIFICATION_PEPPER_PREVIOUS_CONFIGURATION_INVALID");
  }
  const expiry = Date.parse(previousValidUntil);
  const overlap = expiry - now.getTime();
  if (!Number.isFinite(expiry) || overlap < MINIMUM_VERIFICATION_PEPPER_OVERLAP_MS || overlap > MAXIMUM_VERIFICATION_PEPPER_OVERLAP_MS) {
    throw new AuthConfigurationError("AUTH_VERIFICATION_PEPPER_PREVIOUS_CONFIGURATION_INVALID");
  }
  const previous = Object.freeze({ id: verificationPepperId(environment, "AUTH_VERIFICATION_PEPPER_PREVIOUS_KID"), secret: previousSecret });
  if (previous.id === current.id) throw new AuthConfigurationError("AUTH_VERIFICATION_PEPPER_PREVIOUS_CONFIGURATION_INVALID");
  return Object.freeze({ current, previous });
}

function verificationPeppers(environment: NodeJS.ProcessEnv = process.env, now: Date = new Date()): readonly VerificationPepper[] {
  const ring = verificationPepperKeyRing(environment, now);
  return ring.previous ? [ring.current, ring.previous] : [ring.current];
}

export function hashPhone(phoneE164: string): string {
  return hmacHex(verificationPepperKeyRing().current.secret, "phone", phoneE164);
}

export function hashPhoneCandidates(phoneE164: string, environment: NodeJS.ProcessEnv = process.env, now: Date = new Date()): string[] {
  return verificationPeppers(environment, now).map((pepper) => hmacHex(pepper.secret, "phone", phoneE164));
}

export function hashRequestIp(ip: string): string {
  return hmacHex(verificationPepperKeyRing().current.secret, "request-ip", ip);
}

export function hashRequestIpCandidates(ip: string, environment: NodeJS.ProcessEnv = process.env, now: Date = new Date()): string[] {
  return verificationPeppers(environment, now).map((pepper) => hmacHex(pepper.secret, "request-ip", ip));
}

export function digestVerificationCode(challengeId: string, code: string): string {
  return hmacHex(verificationPepperKeyRing().current.secret, "verification-code", `${challengeId}:${code}`);
}

export function digestVerificationCodeCandidates(challengeId: string, code: string, environment: NodeJS.ProcessEnv = process.env, now: Date = new Date()): string[] {
  return verificationPeppers(environment, now).map((pepper) => hmacHex(pepper.secret, "verification-code", `${challengeId}:${code}`));
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
    secret: new TextEncoder().encode(requiredSecret("SESSION_SECRET", environment)),
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
  const overlap = validUntilMilliseconds - now.getTime();
  if (!Number.isFinite(validUntilMilliseconds) || overlap <= 0 || overlap > MAXIMUM_SESSION_SECRET_OVERLAP_MS) {
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
