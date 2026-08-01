export type ProductCapability = "video_generation" | "commerce_purchase";
type CapabilityEnvironment = Record<string, string | undefined>;

const ENVIRONMENT_KEYS: Record<ProductCapability, string> = {
  video_generation: "YIJIAN_VIDEO_GENERATION_ENABLED",
  commerce_purchase: "YIJIAN_COMMERCE_PURCHASE_ENABLED",
};

const PUBLIC_ERROR_CODES: Record<ProductCapability, string> = {
  video_generation: "VIDEO_GENERATION_DISABLED",
  commerce_purchase: "COMMERCE_PURCHASES_DISABLED",
};

export class ProductCapabilityUnavailableError extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = "ProductCapabilityUnavailableError";
  }
}

/**
 * A missing flag preserves the already-configured capability. Operators can
 * stop a single mutation path immediately with an exact `false`; malformed
 * values fail closed rather than silently enabling it.
 */
export function assertProductCapabilityEnabled(
  capability: ProductCapability,
  environment: CapabilityEnvironment = process.env,
): void {
  const value = environment[ENVIRONMENT_KEYS[capability]];
  if (value === undefined || value === "true") return;
  throw new ProductCapabilityUnavailableError(PUBLIC_ERROR_CODES[capability]);
}
