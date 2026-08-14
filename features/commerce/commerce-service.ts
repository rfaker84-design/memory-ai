import { randomBytes } from "node:crypto";

import { CommerceStateError, CommerceValidationError } from "./errors";
import type { CommercePaymentAdapter } from "./payment-adapter";
import type { CommerceRepository } from "./commerce-repository";
import type {
  CommercePaymentEvent,
  CommercePlatform,
  CommerceRefundRequest,
  GenerationPurpose,
  GenerationSettlementOutcome,
  OccasionKind,
  OccasionRewardOffer,
  PhotoRemedyInput,
} from "./types";
import { getCommerceProduct } from "./catalog";

/**
 * A paid Commerce package may make one or more of its owner's existing
 * portraits eligible for the companion-motion pack.  This is deliberately a
 * server-side lifecycle hook: rendering Companion or Chat must never enqueue
 * paid work.
 */
export type PaidCompanionMotionLifecycle = {
  enqueueForPaidOrder(input: { orderNo: string }): Promise<void>;
};

const KEY_PATTERN = /^[A-Za-z0-9._:-]{16,128}$/;
const CODE_PATTERN = /^[A-HJ-NP-Z2-9]{10}$/;
const GENERATION_KEY_PATTERN = /^[A-Za-z0-9._:-]{16,128}$/;

function key(value: string, field = "Idempotency-Key"): string {
  if (!KEY_PATTERN.test(value)) {
    throw new CommerceValidationError(`${field} is invalid`);
  }
  return value;
}

function text(value: string, field: string, maxLength: number): string {
  const normalized = value.trim();
  if (!normalized || normalized.length > maxLength) {
    throw new CommerceValidationError(`${field} is invalid`);
  }
  return normalized;
}

export class CommerceService {
  constructor(
    private readonly repository: CommerceRepository,
    private readonly companionMotionLifecycle?: PaidCompanionMotionLifecycle,
  ) {}

  async createOrder(input: {
    externalUserId: string;
    requestKey: string;
    productId: string;
    platform: CommercePlatform;
    adapter: CommercePaymentAdapter;
  }) {
    if (input.platform === "ios" && input.adapter.rail !== "storekit_iap") {
      throw new CommerceStateError("IOS_DIGITAL_GOODS_REQUIRE_STOREKIT");
    }
    if (input.platform !== "ios" && input.adapter.rail === "storekit_iap") {
      throw new CommerceStateError("STOREKIT_REQUIRES_IOS");
    }
    input.adapter.assertAvailable?.();
    const order = await this.repository.createOrder({
      externalUserId: text(input.externalUserId, "userId", 255),
      requestKey: key(input.requestKey),
      product: getCommerceProduct(input.productId),
      platform: input.platform,
      paymentRail: input.adapter.rail,
    });
    return {
      order,
      checkout:
        order.status === "pending"
          ? await input.adapter.prepareCheckout(order)
          : null,
    };
  }

  listOrders(externalUserId: string) {
    return this.repository.listOrders(text(externalUserId, "userId", 255));
  }

  async applyPaymentEvent(
    rail: "test" | "storekit_iap",
    event: CommercePaymentEvent,
  ) {
    const settlement = await this.repository.applyPaymentEvent(rail, event);
    // A provider can retry the same accepted payment after its first response
    // was lost. Re-running the lifecycle on that duplicate is safe and is the
    // recovery path for a transient input-staging failure. Refunds never run
    // this hook and do not delete historical artifacts.
    if (
      event.kind === "payment"
      && event.status === "succeeded"
      && (settlement.outcome === "paid" || settlement.outcome === "duplicate")
    ) {
      const lifecycle = this.companionMotionLifecycle
        ?? await this.createRuntimeCompanionMotionLifecycle();
      await lifecycle?.enqueueForPaidOrder({
        orderNo: settlement.orderNo,
      });
    }
    return settlement;
  }

  private async createRuntimeCompanionMotionLifecycle(): Promise<PaidCompanionMotionLifecycle | undefined> {
    // Local/test fixtures intentionally inject an explicit port. The real
    // production settlement path is self-contained so a new payment adapter
    // cannot accidentally omit the companion-motion lifecycle.
    if (process.env.NODE_ENV !== "production") return undefined;
    const [motion, runtime] = await Promise.all([
      import("../video/companion-micro-motion"),
      import("../video/first-presence-video-runtime"),
    ]);
    return new motion.PaidCompanionMotionLifecycle(
      new motion.CompanionMotionPackService(runtime.createFirstPresenceVideoOwnerInputStaging),
    );
  }

  requestRefund(input: {
    externalUserId: string;
    orderNo: string;
    requestKey: string;
    reason: CommerceRefundRequest["reason"];
  }) {
    return this.repository.requestRefund({
      ...input,
      externalUserId: text(input.externalUserId, "userId", 255),
      orderNo: text(input.orderNo, "orderNo", 64),
      requestKey: key(input.requestKey),
    });
  }

  getCreditBalance(externalUserId: string) {
    return this.repository.getCreditBalance(
      text(externalUserId, "userId", 255),
    );
  }

  reserveGeneration(input: {
    externalUserId: string;
    memoryId: string;
    requestKey: string;
    generationKey: string;
    purpose: GenerationPurpose;
  }) {
    return this.repository.reserveGeneration({
      ...input,
      externalUserId: text(input.externalUserId, "userId", 255),
      memoryId: text(input.memoryId, "memoryId", 64),
      requestKey: key(input.requestKey),
      generationKey: key(input.generationKey, "generationKey"),
    });
  }

  settleGeneration(input: {
    externalUserId: string;
    requestKey: string;
    outcome: GenerationSettlementOutcome;
  }) {
    return this.repository.settleGeneration({
      ...input,
      externalUserId: text(input.externalUserId, "userId", 255),
      requestKey: key(input.requestKey),
    });
  }

  recoverGeneration(externalUserId: string, requestKey: string) {
    return this.repository.recoverGeneration(
      text(externalUserId, "userId", 255),
      key(requestKey),
    );
  }

  requestPhotoRemedy(input: PhotoRemedyInput) {
    if (!/^[0-9a-f]{64}$/.test(input.replacementPhotoDigest)) {
      throw new CommerceValidationError("replacementPhotoDigest is invalid");
    }
    if (!GENERATION_KEY_PATTERN.test(input.originalGenerationKey)) {
      throw new CommerceValidationError("originalGenerationKey is invalid");
    }
    return this.repository.requestPhotoRemedy({
      ...input,
      externalUserId: text(input.externalUserId, "userId", 255),
      memoryId: text(input.memoryId, "memoryId", 64),
      requestKey: key(input.requestKey),
    });
  }

  canSaveGeneration(externalUserId: string, generationKey: string) {
    return this.repository.canSaveGeneration(
      text(externalUserId, "userId", 255),
      key(generationKey, "generationKey"),
    );
  }

  createReferralCode(input: {
    externalUserId: string;
    requestKey: string;
    code?: string;
  }) {
    const code =
      input.code
      ?? randomBytes(8)
        .toString("base64url")
        .toUpperCase()
        .replace(/[01OIL_-]/g, "A")
        .slice(0, 10);
    if (!CODE_PATTERN.test(code)) {
      throw new CommerceValidationError("referral code is invalid");
    }
    return this.repository.createReferralCode({
      externalUserId: text(input.externalUserId, "userId", 255),
      requestKey: key(input.requestKey),
      code,
    });
  }

  qualifyReferral(input: {
    inviteeExternalUserId: string;
    requestKey: string;
    code: string;
    deviceKeyHash: string;
  }) {
    if (!CODE_PATTERN.test(input.code)) {
      throw new CommerceValidationError("referral code is invalid");
    }
    if (!/^[0-9a-f]{64}$/.test(input.deviceKeyHash)) {
      throw new CommerceValidationError("device identity is invalid");
    }
    return this.repository.qualifyReferral({
      ...input,
      inviteeExternalUserId: text(
        input.inviteeExternalUserId,
        "userId",
        255,
      ),
      requestKey: key(input.requestKey),
    });
  }

  getReferralStatus(externalUserId: string) {
    return this.repository.getReferralStatus(
      text(externalUserId, "userId", 255),
    );
  }

  claimOccasionReward(input: {
    externalUserId: string;
    requestKey: string;
    occasion: OccasionKind;
    now?: Date;
  }) {
    if (!["birthday", "mothers_day", "fathers_day"].includes(input.occasion)) {
      throw new CommerceValidationError("occasion is invalid");
    }
    return this.repository.claimOccasionReward({
      ...input,
      externalUserId: text(input.externalUserId, "userId", 255),
      requestKey: key(input.requestKey),
    });
  }

  listRefunds(externalUserId: string) {
    return this.repository.listRefunds(text(externalUserId, "userId", 255));
  }

  listOpenOccasionRewardOffers(input: {
    externalUserId: string;
    now?: Date;
  }): Promise<OccasionRewardOffer[]> {
    return this.repository.listOpenOccasionRewardOffers({
      externalUserId: text(input.externalUserId, "userId", 255),
      now: input.now,
    });
  }

  reconcileOrders(now?: Date) {
    return this.repository.reconcileOrders(now);
  }
}
