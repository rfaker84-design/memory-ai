import { PaymentConfigurationError } from "./errors";
import type { PaymentProduct } from "./types";

function required(environment: NodeJS.ProcessEnv, name: string): string {
  const value = environment[name]?.trim();
  if (!value) throw new PaymentConfigurationError("PAYMENT_PRODUCT_NOT_CONFIGURED");
  return value;
}

function boundedInteger(environment: NodeJS.ProcessEnv, name: string, min: number, max: number): number {
  const value = required(environment, name);
  if (!/^\d+$/.test(value)) throw new PaymentConfigurationError("PAYMENT_PRODUCT_NOT_CONFIGURED");
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < min || parsed > max) {
    throw new PaymentConfigurationError("PAYMENT_PRODUCT_NOT_CONFIGURED");
  }
  return parsed;
}

/** The sole non-renewing first-release experience product. */
export function loadMemoryExperienceProduct(environment: NodeJS.ProcessEnv = process.env): PaymentProduct {
  const id = required(environment, "YIJIAN_EXPERIENCE_PRODUCT_ID");
  if (!/^[A-Za-z0-9._-]{1,100}$/.test(id)) {
    throw new PaymentConfigurationError("PAYMENT_PRODUCT_NOT_CONFIGURED");
  }
  return {
    id,
    priceFen: boundedInteger(environment, "YIJIAN_EXPERIENCE_PRICE_FEN", 1, 100_000_000),
    durationDays: boundedInteger(environment, "YIJIAN_EXPERIENCE_DURATION_DAYS", 1, 366),
    chatQuota: boundedInteger(environment, "YIJIAN_EXPERIENCE_CHAT_QUOTA", 1, 1_000_000),
  };
}
