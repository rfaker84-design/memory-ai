import { CommerceConfigurationError, CommerceValidationError } from "./errors";
import type {
  CheckoutAction,
  CommerceOrder,
  CommercePaymentRail,
  CommercePlatform,
} from "./types";

export interface CommercePaymentAdapter {
  readonly rail: CommercePaymentRail;
  assertAvailable?(): void;
  prepareCheckout(order: CommerceOrder): Promise<CheckoutAction>;
}

export class TestCommercePaymentAdapter implements CommercePaymentAdapter {
  readonly rail = "test" as const;

  constructor(private readonly environment: NodeJS.ProcessEnv = process.env) {}

  assertAvailable(): void {
    if (
      this.environment.NODE_ENV === "production"
      || this.environment.COMMERCE_TEST_MODE !== "true"
    ) {
      throw new CommerceConfigurationError("COMMERCE_TEST_PAYMENT_DISABLED");
    }
  }

  async prepareCheckout(order: CommerceOrder): Promise<CheckoutAction> {
    this.assertAvailable();
    return {
      kind: "test_callback_required",
      orderNo: order.orderNo,
      chargesMoney: false,
    };
  }
}

/**
 * StoreKit is intentionally a boundary only. Native code must complete the IAP
 * and submit an App Store signed transaction before the server settles it.
 */
export class StoreKitBoundaryAdapter implements CommercePaymentAdapter {
  readonly rail = "storekit_iap" as const;

  async prepareCheckout(order: CommerceOrder): Promise<CheckoutAction> {
    if (order.platform !== "ios") {
      throw new CommerceValidationError("STOREKIT_REQUIRES_IOS");
    }
    return {
      kind: "storekit_required",
      orderNo: order.orderNo,
      appAccountToken: order.id,
      chargesMoney: false,
    };
  }
}

export function createCommercePaymentAdapter(
  platform: CommercePlatform,
  environment: NodeJS.ProcessEnv = process.env,
): CommercePaymentAdapter {
  if (platform === "ios") return new StoreKitBoundaryAdapter();
  return new TestCommercePaymentAdapter(environment);
}
