import {
  createHmac,
  randomInt,
  timingSafeEqual,
} from "node:crypto";

export class AuthConfigurationError extends Error {
  constructor(public readonly code: string) {
    super(code);
    this.name = "AuthConfigurationError";
  }
}

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

export function generateVerificationCode(): string {
  return randomInt(0, 1_000_000).toString().padStart(6, "0");
}

export function sessionSecret(): Uint8Array {
  return new TextEncoder().encode(requiredSecret("SESSION_SECRET"));
}
