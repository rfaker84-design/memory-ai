import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";

import type { CommerceDataSource } from "./commerce-datasource";
import { CommerceRepository } from "./commerce-repository";
import { CommerceService } from "./commerce-service";
import {
  CommerceStateError,
  CommerceValidationError,
} from "./errors";
import {
  StoreKitBoundaryAdapter,
  TestCommercePaymentAdapter,
} from "./payment-adapter";
import type {
  CommerceOrder,
  CommercePaymentEvent,
  CommerceRefundRequest,
  CommerceSettlement,
  CreateCommerceOrderInput,
  CreditBalance,
  CreditSourceKind,
  GenerationPurpose,
  GenerationReservation,
  GenerationSettlementOutcome,
  OccasionKind,
  OccasionReward,
  OccasionRewardOffer,
  PhotoRemedyInput,
  ReconciliationReport,
  ReferralCode,
  ReferralQualification,
  ReferralStatus,
} from "./types";
import { getCommerceProduct, listCommerceProducts } from "./catalog";
import { isOccasionClaimOpen, OCCASION_KINDS, occasionRewardWindow } from "./occasion-rewards";

type Lot = {
  source: CreditSourceKind;
  total: number;
  reserved: number;
  consumed: number;
  saveAllowed: boolean;
  active: boolean;
};

class TestLedger implements CommerceDataSource {
  readonly firstMemory = new Map<string, string>();
  readonly createdAt = new Map<string, number>();
  readonly orders = new Map<string, CommerceOrder>();
  readonly ordersByRequest = new Map<string, CommerceOrder>();
  readonly orderOwners = new Map<string, string>();
  readonly lots = new Map<string, Lot[]>();
  readonly reservations = new Map<string, GenerationReservation>();
  readonly events = new Map<string, string>();
  readonly refunds = new Map<string, CommerceRefundRequest>();
  readonly referralCodes = new Map<string, ReferralCode>();
  readonly codeOwners = new Map<string, string>();
  readonly referralQualifications = new Map<
    string,
    {
      inviter: string;
      invitee: string;
      requestKey: string;
      device: string;
      rewardCohort: number | null;
    }
  >();
  readonly usedDevices = new Set<string>();
  readonly usedPhones = new Set<string>();
  readonly remedies = new Map<string, string>();
  readonly occasionRewards = new Map<string, OccasionReward>();
  readonly birthDates = new Map<string, string>();
  readonly saveRightUsers = new Set<string>();
  corruptPaidLot = false;

  register(user: string, firstMemory: string, createdAt = Date.now()) {
    this.firstMemory.set(user, firstMemory);
    this.createdAt.set(user, createdAt);
    this.lots.set(user, []);
    this.birthDates.set(user, "1990-01-01");
  }

  async createOrder(input: CreateCommerceOrderInput): Promise<CommerceOrder> {
    const requestScope = `${input.externalUserId}:${input.requestKey}`;
    const existing = this.ordersByRequest.get(requestScope);
    if (existing) {
      if (
        existing.productId !== input.product.id
        || existing.platform !== input.platform
        || existing.paymentRail !== input.paymentRail
      ) {
        throw new CommerceStateError("Idempotency-Key payload conflict");
      }
      return existing;
    }
    const id = `00000000-0000-4000-8000-${String(this.orders.size + 1).padStart(12, "0")}`;
    const created: CommerceOrder = {
      id,
      orderNo:
        input.orderNo
        ?? `YC20260727000000${String(this.orders.size + 1).padStart(12, "A")}`,
      productId: input.product.id,
      platform: input.platform,
      paymentRail: input.paymentRail,
      amountFen: input.product.priceFen,
      currency: "CNY",
      generationCredits: input.product.generationCredits,
      grantsFirstPreviewSave: true,
      status: "pending",
      providerTransactionId: null,
      createdAt: new Date().toISOString(),
      paidAt: null,
      refundedAt: null,
    };
    this.orders.set(created.orderNo, created);
    this.ordersByRequest.set(requestScope, created);
    this.orderOwners.set(created.orderNo, input.externalUserId);
    return created;
  }

  async listOrders(externalUserId: string): Promise<CommerceOrder[]> {
    return [...this.ordersByRequest.entries()]
      .filter(([scope]) => scope.startsWith(`${externalUserId}:`))
      .map(([, value]) => value);
  }

  async applyPaymentEvent(
    _rail: CommerceOrder["paymentRail"],
    event: CommercePaymentEvent,
  ): Promise<CommerceSettlement> {
    const duplicate = this.events.get(event.eventId);
    if (duplicate) {
      if (duplicate !== event.payloadHash) {
        throw new CommerceStateError("Payment event id conflict");
      }
      return { outcome: "duplicate", orderNo: event.orderNo };
    }
    const order = this.orders.get(event.orderNo);
    if (!order || order.amountFen !== event.amountFen) {
      throw new CommerceStateError("Payment event mismatch");
    }
    this.events.set(event.eventId, event.payloadHash);
    const owner = this.orderOwners.get(order.orderNo)!;
    if (event.kind === "refund") {
      const request = this.refunds.get(order.orderNo);
      if (!request || request.requestNo !== event.refundRequestNo) {
        throw new CommerceStateError("Refund request missing");
      }
      if (
        event.status !== "refunded"
        || order.status !== "paid"
        || order.providerTransactionId !== event.transactionId
      ) {
        return { outcome: "failed", orderNo: order.orderNo };
      }
      order.status = "refunded";
      order.refundedAt = new Date().toISOString();
      request.status = "succeeded";
      request.resolvedAt = new Date().toISOString();
      const paid = this.lots.get(owner)?.find(
        (lot) => lot.source === "paid_package" && lot.total === order.generationCredits,
      );
      if (paid) paid.active = false;
      const stillPaid = [...this.orders.values()].some(
        (candidate) =>
          candidate !== order
          && candidate.status === "paid"
          && this.orderOwners.get(candidate.orderNo) === owner,
      );
      if (!stillPaid) this.saveRightUsers.delete(owner);
      return { outcome: "refunded", orderNo: order.orderNo };
    }
    if (event.status !== "succeeded") {
      order.status = event.status === "cancelled" ? "cancelled" : "failed";
      return { outcome: order.status, orderNo: order.orderNo };
    }
    if (order.status === "paid") {
      if (order.providerTransactionId !== event.transactionId) {
        throw new CommerceStateError("Transaction conflict");
      }
      return { outcome: "duplicate", orderNo: order.orderNo };
    }
    order.status = "paid";
    order.providerTransactionId = event.transactionId;
    order.paidAt = new Date().toISOString();
    this.lots.get(owner)!.push({
      source: "paid_package",
      total: order.generationCredits,
      reserved: 0,
      consumed: 0,
      saveAllowed: true,
      active: true,
    });
    this.saveRightUsers.add(owner);
    return { outcome: "paid", orderNo: order.orderNo };
  }

  async requestRefund(input: {
    externalUserId: string;
    orderNo: string;
    requestKey: string;
    reason: CommerceRefundRequest["reason"];
  }): Promise<CommerceRefundRequest> {
    const existing = this.refunds.get(input.orderNo);
    if (existing) return existing;
    const order = this.orders.get(input.orderNo);
    if (!order || order.status !== "paid") {
      throw new CommerceStateError("Order is not refundable");
    }
    const created: CommerceRefundRequest = {
      id: `refund-${this.refunds.size + 1}`,
      orderNo: input.orderNo,
      requestNo: `YCR20260727000000${String(this.refunds.size + 1).padStart(10, "A")}`,
      reason: input.reason,
      status: "manual_review",
      createdAt: new Date().toISOString(),
      resolvedAt: null,
    };
    this.refunds.set(input.orderNo, created);
    return created;
  }

  async listRefunds(externalUserId: string): Promise<CommerceRefundRequest[]> {
    return [...this.refunds.values()].filter((refund) => this.orderOwners.get(refund.orderNo) === externalUserId);
  }

  async getCreditBalance(externalUserId: string): Promise<CreditBalance> {
    const sums = new Map<CreditSourceKind, number>();
    for (const lot of this.lots.get(externalUserId) ?? []) {
      if (!lot.active) continue;
      sums.set(
        lot.source,
        (sums.get(lot.source) ?? 0)
          + lot.total
          - lot.reserved
          - lot.consumed,
      );
    }
    const paidAvailable = sums.get("paid_package") ?? 0;
    const referralAvailable = sums.get("referral_reward") ?? 0;
    const freePreviewAvailable = sums.get("free_preview") ?? 0;
    const photoRemedyAvailable = sums.get("photo_remedy") ?? 0;
    const occasionAvailable = sums.get("occasion_reward") ?? 0;
    return {
      paidAvailable,
      referralAvailable,
      freePreviewAvailable,
      photoRemedyAvailable,
      occasionAvailable,
      totalAvailable:
        paidAvailable
        + referralAvailable
        + freePreviewAvailable
        + photoRemedyAvailable
        + occasionAvailable,
      paidCreditsNeverExpire: true,
      canSaveFirstPreview: this.saveRightUsers.has(externalUserId),
    };
  }

  async reserveGeneration(input: {
    externalUserId: string;
    memoryId: string;
    requestKey: string;
    generationKey: string;
    purpose: GenerationPurpose;
  }): Promise<GenerationReservation> {
    const scope = `${input.externalUserId}:${input.requestKey}`;
    const existing = this.reservations.get(scope);
    if (existing) {
      if (
        existing.memoryId !== input.memoryId
        || existing.generationKey !== input.generationKey
        || existing.purpose !== input.purpose
      ) {
        throw new CommerceStateError("Idempotency-Key payload conflict");
      }
      return existing;
    }
    const source: Record<GenerationPurpose, CreditSourceKind> = {
      first_preview: "free_preview",
      new_video: "paid_package",
      photo_remedy: "photo_remedy",
      referral_experience: "referral_reward",
      occasion_experience: "occasion_reward",
    };
    if (input.purpose === "first_preview") {
      if (this.firstMemory.get(input.externalUserId) !== input.memoryId) {
        throw new CommerceStateError("First memory only");
      }
      if (
        !(this.lots.get(input.externalUserId) ?? []).some(
          (lot) => lot.source === "free_preview",
        )
      ) {
        this.lots.get(input.externalUserId)!.push({
          source: "free_preview",
          total: 1,
          reserved: 0,
          consumed: 0,
          saveAllowed: false,
          active: true,
        });
      }
    }
    const lot = (this.lots.get(input.externalUserId) ?? []).find(
      (candidate) =>
        candidate.source === source[input.purpose]
        && candidate.active
        && candidate.total > candidate.reserved + candidate.consumed,
    );
    if (!lot) throw new CommerceStateError("GENERATION_CREDIT_UNAVAILABLE");
    lot.reserved += 1;
    const created: GenerationReservation = {
      id: `reservation-${this.reservations.size + 1}`,
      memoryId: input.memoryId,
      requestKey: input.requestKey,
      generationKey: input.generationKey,
      purpose: input.purpose,
      sourceKind: lot.source,
      saveAllowed: lot.saveAllowed,
      status: "reserved",
      outcome: null,
      createdAt: new Date().toISOString(),
      settledAt: null,
    };
    this.reservations.set(scope, created);
    return created;
  }

  async settleGeneration(input: {
    externalUserId: string;
    requestKey: string;
    outcome: GenerationSettlementOutcome;
  }): Promise<GenerationReservation> {
    const current = this.reservations.get(
      `${input.externalUserId}:${input.requestKey}`,
    );
    if (!current) throw new CommerceStateError("Reservation missing");
    if (current.status !== "reserved") {
      if (current.outcome === input.outcome) return current;
      throw new CommerceStateError("Generation already settled");
    }
    const lot = this.lots
      .get(input.externalUserId)!
      .find((candidate) => candidate.source === current.sourceKind && candidate.reserved > 0)!;
    lot.reserved -= 1;
    if (input.outcome === "succeeded") lot.consumed += 1;
    current.status = input.outcome === "succeeded" ? "consumed" : "released";
    current.outcome = input.outcome;
    current.settledAt = new Date().toISOString();
    return current;
  }

  async recoverGeneration(
    externalUserId: string,
    requestKey: string,
  ): Promise<GenerationReservation | null> {
    return this.reservations.get(`${externalUserId}:${requestKey}`) ?? null;
  }

  async requestPhotoRemedy(input: PhotoRemedyInput) {
    const scope = `${input.externalUserId}:${input.memoryId}`;
    const existing = this.remedies.get(scope);
    if (existing) {
      if (existing !== input.requestKey) {
        throw new CommerceStateError("Photo remedy already used");
      }
      return { memoryId: input.memoryId, granted: true as const, saveAllowed: false as const };
    }
    const preview = [...this.reservations.values()].find(
      (candidate) =>
        candidate.memoryId === input.memoryId
        && candidate.generationKey === input.originalGenerationKey
        && candidate.purpose === "first_preview"
        && candidate.status === "consumed",
    );
    if (!preview) throw new CommerceStateError("Successful preview required");
    this.remedies.set(scope, input.requestKey);
    this.lots.get(input.externalUserId)!.push({
      source: "photo_remedy",
      total: 1,
      reserved: 0,
      consumed: 0,
      saveAllowed: false,
      active: true,
    });
    return { memoryId: input.memoryId, granted: true as const, saveAllowed: false as const };
  }

  async canSaveGeneration(
    externalUserId: string,
    generationKey: string,
  ): Promise<boolean> {
    return (
      this.saveRightUsers.has(externalUserId)
      && [...this.reservations.values()].some(
        (item) =>
          item.generationKey === generationKey
          && item.purpose === "first_preview"
          && item.status === "consumed",
      )
    );
  }

  async createReferralCode(input: {
    externalUserId: string;
    requestKey: string;
    code?: string;
  }): Promise<ReferralCode> {
    const existing = this.referralCodes.get(input.externalUserId);
    if (existing) return existing;
    const created = {
      code: input.code ?? "ABCDEFGH23",
      createdAt: new Date().toISOString(),
    };
    this.referralCodes.set(input.externalUserId, created);
    this.codeOwners.set(created.code, input.externalUserId);
    return created;
  }

  async qualifyReferral(input: {
    inviteeExternalUserId: string;
    requestKey: string;
    code: string;
    deviceKeyHash: string;
  }): Promise<ReferralQualification> {
    if (!/^phone:[0-9a-f]{64}$/.test(input.inviteeExternalUserId)) {
      throw new CommerceStateError("Verified phone required");
    }
    const inviter = this.codeOwners.get(input.code);
    if (!inviter || inviter === input.inviteeExternalUserId) {
      throw new CommerceStateError("Invalid referral");
    }
    if (
      Date.now() - (this.createdAt.get(input.inviteeExternalUserId) ?? 0)
      > 60 * 60 * 1000
    ) {
      throw new CommerceStateError("New user required");
    }
    const phone = input.inviteeExternalUserId.slice("phone:".length);
    const existing = this.referralQualifications.get(input.inviteeExternalUserId);
    if (existing) {
      if (
        existing.inviter !== inviter
        || existing.requestKey !== input.requestKey
        || existing.device !== input.deviceKeyHash
      ) {
        throw new CommerceStateError("Referral identity already used");
      }
      const count = [...this.referralQualifications.values()].filter(
        (item) => item.inviter === inviter,
      ).length;
      return {
        inviterExternalUserId: inviter,
        inviteeExternalUserId: input.inviteeExternalUserId,
        qualifiedCount: count,
        rewardGranted: existing.rewardCohort !== null,
        rewardCohort: existing.rewardCohort,
      };
    }
    if (this.usedPhones.has(phone) || this.usedDevices.has(input.deviceKeyHash)) {
      throw new CommerceStateError("Referral identity already used");
    }
    this.usedPhones.add(phone);
    this.usedDevices.add(input.deviceKeyHash);
    const count =
      [...this.referralQualifications.values()].filter(
        (item) => item.inviter === inviter,
      ).length + 1;
    const rewardCohort = count % 3 === 0 ? count / 3 : null;
    this.referralQualifications.set(input.inviteeExternalUserId, {
      inviter,
      invitee: input.inviteeExternalUserId,
      requestKey: input.requestKey,
      device: input.deviceKeyHash,
      rewardCohort,
    });
    if (rewardCohort !== null) {
      this.lots.get(inviter)!.push({
        source: "referral_reward",
        total: 1,
        reserved: 0,
        consumed: 0,
        saveAllowed: false,
        active: true,
      });
    }
    return {
      inviterExternalUserId: inviter,
      inviteeExternalUserId: input.inviteeExternalUserId,
      qualifiedCount: count,
      rewardGranted: rewardCohort !== null,
      rewardCohort,
    };
  }

  async getReferralStatus(externalUserId: string): Promise<ReferralStatus> {
    const code = this.referralCodes.get(externalUserId);
    if (!code) throw new CommerceStateError("Code missing");
    const items = [...this.referralQualifications.values()].filter(
      (item) => item.inviter === externalUserId,
    );
    const count = items.length;
    return {
      code: code.code,
      qualifiedInvitees: count,
      rewardsGranted: items.filter((item) => item.rewardCohort !== null).length,
      inviteesUntilNextReward: count % 3 === 0 ? 3 : 3 - (count % 3),
    };
  }

  async claimOccasionReward(input: {
    externalUserId: string;
    requestKey: string;
    occasion: OccasionKind;
    now?: Date;
  }): Promise<OccasionReward> {
    const now = input.now ?? new Date();
    const window = occasionRewardWindow(
      input.occasion,
      this.birthDates.get(input.externalUserId) ?? "",
      now,
    );
    if (!window || !isOccasionClaimOpen(window, now)) {
      throw new CommerceStateError("OCCASION_CLAIM_NOT_OPEN");
    }
    const scope = `${input.externalUserId}:${window.occasion}:${window.calendarYear}`;
    const existing = this.occasionRewards.get(scope);
    if (existing) return existing;
    const reward: OccasionReward = {
      occasion: window.occasion,
      calendarYear: window.calendarYear,
      eligibleOn: window.eligibleOn,
      claimDeadline: window.claimDeadline,
      claimedAt: now.toISOString(),
      saveAllowed: true,
    };
    this.occasionRewards.set(scope, reward);
    this.lots.get(input.externalUserId)!.push({
      source: "occasion_reward",
      total: 1,
      reserved: 0,
      consumed: 0,
      saveAllowed: true,
      active: true,
    });
    return reward;
  }

  async listOpenOccasionRewardOffers(input: {
    externalUserId: string;
    now?: Date;
  }): Promise<OccasionRewardOffer[]> {
    const now = input.now ?? new Date();
    return OCCASION_KINDS.flatMap((occasion) => {
      const window = occasionRewardWindow(
        occasion,
        this.birthDates.get(input.externalUserId) ?? "",
        now,
      );
      if (!window || !isOccasionClaimOpen(window, now)) return [];
      return [{
        occasion: window.occasion,
        calendarYear: window.calendarYear,
        eligibleOn: window.eligibleOn,
        claimDeadline: window.claimDeadline,
        claimed: this.occasionRewards.has(
          `${input.externalUserId}:${window.occasion}:${window.calendarYear}`,
        ),
      }];
    });
  }

  async reconcileOrders(now = new Date()): Promise<ReconciliationReport> {
    return {
      checkedAt: now.toISOString(),
      ordersChecked: this.orders.size,
      issues: this.corruptPaidLot
        ? [{
            code: "PAID_ORDER_CREDIT_MISMATCH",
            orderNo: [...this.orders.keys()][0],
            detail: "test corruption",
          }]
        : [],
    };
  }
}

function fixture(lifecycle?: { enqueueForPaidOrder(input: { orderNo: string }): Promise<void> }) {
  const dataSource = new TestLedger();
  const user = `phone:${"a".repeat(64)}`;
  dataSource.register(
    user,
    "00000000-0000-4000-8000-000000000101",
  );
  return {
    dataSource,
    user,
    service: new CommerceService(new CommerceRepository(dataSource), lifecycle),
  };
}

test("a paid Commerce settlement enqueues durable companion motion once and retries the lifecycle on a duplicate payment", async () => {
  const calls: string[] = [];
  const { service, user } = fixture({
    async enqueueForPaidOrder({ orderNo }) { calls.push(orderNo); },
  });
  const order = await service.createOrder({
    externalUserId: user,
    requestKey: "motion-lifecycle-order-0001",
    productId: "memory_video_49",
    platform: "web",
    adapter: new TestCommercePaymentAdapter({ NODE_ENV: "test", COMMERCE_TEST_MODE: "true" }),
  });
  const event = paymentEvent(order.order, "motion-lifecycle-event-0001");
  await service.applyPaymentEvent("test", event);
  await service.applyPaymentEvent("test", event);
  assert.deepEqual(calls, [order.order.orderNo, order.order.orderNo]);
});

test("refund and failed payment events never enqueue companion motion", async () => {
  const calls: string[] = [];
  const { service, user } = fixture({
    async enqueueForPaidOrder({ orderNo }) { calls.push(orderNo); },
  });
  const order = await service.createOrder({
    externalUserId: user,
    requestKey: "motion-lifecycle-failed-order-0001",
    productId: "memory_video_49",
    platform: "web",
    adapter: new TestCommercePaymentAdapter({ NODE_ENV: "test", COMMERCE_TEST_MODE: "true" }),
  });
  await service.applyPaymentEvent("test", {
    ...paymentEvent(order.order, "motion-lifecycle-failed-event-0001"),
    status: "failed",
  });
  assert.deepEqual(calls, []);
});

function paymentEvent(
  order: CommerceOrder,
  eventId: string,
): CommercePaymentEvent {
  return {
    eventId,
    kind: "payment",
    orderNo: order.orderNo,
    transactionId: `transaction-${eventId}`,
    status: "succeeded",
    amountFen: order.amountFen,
    payloadHash: createHash("sha256").update(eventId).digest("hex"),
  };
}

test("catalog is fixed at 49/99/199 with 2/6/15 permanent credits", () => {
  assert.deepEqual(
    listCommerceProducts().map((item) => [
      item.priceFen,
      item.generationCredits,
      item.grantsFirstPreviewSave,
    ]),
    [
      [4900, 2, true],
      [9900, 6, true],
      [19900, 15, true],
    ],
  );
  assert.throws(() => getCommerceProduct("unknown"), CommerceValidationError);
});

test("test payments are non-production only and iOS is reserved for StoreKit", async () => {
  const { service, user } = fixture();
  await assert.rejects(
    () =>
      service.createOrder({
        externalUserId: user,
        requestKey: "order-production-0001",
        productId: "memory_video_49",
        platform: "web",
        adapter: new TestCommercePaymentAdapter({
          NODE_ENV: "production",
          COMMERCE_TEST_MODE: "true",
        }),
      }),
    /COMMERCE_TEST_PAYMENT_DISABLED/,
  );
  const ios = await service.createOrder({
    externalUserId: user,
    requestKey: "order-ios-storekit-0001",
    productId: "memory_video_49",
    platform: "ios",
    adapter: new StoreKitBoundaryAdapter(),
  });
  assert.equal(ios.order.paymentRail, "storekit_iap");
  assert.equal(ios.checkout?.kind, "storekit_required");
  assert.equal(ios.checkout?.chargesMoney, false);
  await assert.rejects(
    () =>
      service.createOrder({
        externalUserId: user,
        requestKey: "order-ios-invalid-0001",
        productId: "memory_video_49",
        platform: "ios",
        adapter: new TestCommercePaymentAdapter({
          NODE_ENV: "test",
          COMMERCE_TEST_MODE: "true",
        }),
      }),
    /IOS_DIGITAL_GOODS_REQUIRE_STOREKIT/,
  );
});

test("all packages settle idempotently and grant the exact permanent balance", async () => {
  for (const productId of [
    "memory_video_49",
    "memory_video_99",
    "memory_video_199",
  ] as const) {
    const { service, user } = fixture();
    const created = await service.createOrder({
      externalUserId: user,
      requestKey: `order-${productId}-0001`,
      productId,
      platform: "web",
      adapter: new TestCommercePaymentAdapter({
        NODE_ENV: "test",
        COMMERCE_TEST_MODE: "true",
      }),
    });
    const repeated = await service.createOrder({
      externalUserId: user,
      requestKey: `order-${productId}-0001`,
      productId,
      platform: "web",
      adapter: new TestCommercePaymentAdapter({
        NODE_ENV: "test",
        COMMERCE_TEST_MODE: "true",
      }),
    });
    assert.equal(repeated.order.id, created.order.id);
    const event = paymentEvent(created.order, `event-${productId}`);
    assert.equal((await service.applyPaymentEvent("test", event)).outcome, "paid");
    assert.equal(
      (await service.applyPaymentEvent("test", event)).outcome,
      "duplicate",
    );
    const balance = await service.getCreditBalance(user);
    assert.equal(balance.paidAvailable, created.order.generationCredits);
    assert.equal(balance.paidCreditsNeverExpire, true);
    assert.equal(balance.canSaveFirstPreview, true);
  }
});

test("reservation survives disconnect; success consumes and failure or invalidation releases", async () => {
  const { service, user } = fixture();
  const memoryId = "00000000-0000-4000-8000-000000000101";
  const preview = await service.reserveGeneration({
    externalUserId: user,
    memoryId,
    requestKey: "preview-reserve-0001",
    generationKey: "preview-generation-0001",
    purpose: "first_preview",
  });
  assert.equal(preview.saveAllowed, false);
  assert.deepEqual(
    await service.recoverGeneration(user, "preview-reserve-0001"),
    preview,
  );
  await service.settleGeneration({
    externalUserId: user,
    requestKey: "preview-reserve-0001",
    outcome: "system_failed",
  });
  assert.equal((await service.getCreditBalance(user)).freePreviewAvailable, 1);

  const retried = await service.reserveGeneration({
    externalUserId: user,
    memoryId,
    requestKey: "preview-reserve-0002",
    generationKey: "preview-generation-0002",
    purpose: "first_preview",
  });
  assert.equal(retried.status, "reserved");
  await service.settleGeneration({
    externalUserId: user,
    requestKey: "preview-reserve-0002",
    outcome: "succeeded",
  });
  assert.equal((await service.getCreditBalance(user)).freePreviewAvailable, 0);
  await assert.rejects(
    () =>
      service.reserveGeneration({
        externalUserId: user,
        memoryId: "00000000-0000-4000-8000-000000000102",
        requestKey: "preview-second-ta-0001",
        generationKey: "preview-second-ta-generation",
        purpose: "first_preview",
      }),
    CommerceStateError,
  );
});

test("one photo replacement remedy is non-saveable and cannot be farmed", async () => {
  const { service, user } = fixture();
  const memoryId = "00000000-0000-4000-8000-000000000101";
  await service.reserveGeneration({
    externalUserId: user,
    memoryId,
    requestKey: "preview-remedy-base-0001",
    generationKey: "preview-remedy-generation",
    purpose: "first_preview",
  });
  await service.settleGeneration({
    externalUserId: user,
    requestKey: "preview-remedy-base-0001",
    outcome: "succeeded",
  });
  const grant = await service.requestPhotoRemedy({
    externalUserId: user,
    memoryId,
    requestKey: "photo-remedy-request-0001",
    originalGenerationKey: "preview-remedy-generation",
    replacementPhotoDigest: "b".repeat(64),
  });
  assert.equal(grant.saveAllowed, false);
  const reservation = await service.reserveGeneration({
    externalUserId: user,
    memoryId,
    requestKey: "photo-remedy-reserve-0001",
    generationKey: "photo-remedy-generation",
    purpose: "photo_remedy",
  });
  assert.equal(reservation.saveAllowed, false);
  await assert.rejects(
    () =>
      service.requestPhotoRemedy({
        externalUserId: user,
        memoryId,
        requestKey: "photo-remedy-request-0002",
        originalGenerationKey: "preview-remedy-generation",
        replacementPhotoDigest: "c".repeat(64),
      }),
    /already used/,
  );
});

test("refund requests and refund callbacks are idempotent and revoke remaining paid credit", async () => {
  const { service, user } = fixture();
  const created = await service.createOrder({
    externalUserId: user,
    requestKey: "refund-order-request-0001",
    productId: "memory_video_99",
    platform: "web",
    adapter: new TestCommercePaymentAdapter({
      NODE_ENV: "test",
      COMMERCE_TEST_MODE: "true",
    }),
  });
  const paid = paymentEvent(created.order, "refund-payment-event");
  await service.applyPaymentEvent("test", paid);
  const request = await service.requestRefund({
    externalUserId: user,
    orderNo: created.order.orderNo,
    requestKey: "refund-request-key-0001",
    reason: "unused_purchase",
  });
  const repeated = await service.requestRefund({
    externalUserId: user,
    orderNo: created.order.orderNo,
    requestKey: "refund-request-key-0001",
    reason: "unused_purchase",
  });
  assert.equal(repeated.id, request.id);
  const event: CommercePaymentEvent = {
    eventId: "refund-callback-event",
    kind: "refund",
    orderNo: created.order.orderNo,
    refundRequestNo: request.requestNo,
    transactionId: paid.transactionId,
    status: "refunded",
    amountFen: created.order.amountFen,
    payloadHash: createHash("sha256").update("refund").digest("hex"),
  };
  assert.equal(
    (await service.applyPaymentEvent("test", event)).outcome,
    "refunded",
  );
  assert.equal(
    (await service.applyPaymentEvent("test", event)).outcome,
    "duplicate",
  );
  assert.equal((await service.getCreditBalance(user)).paidAvailable, 0);
  assert.equal((await service.getCreditBalance(user)).canSaveFirstPreview, false);
});

test("three distinct verified phones and attested devices grant one non-save reward", async () => {
  const { dataSource, service, user } = fixture();
  const code = await service.createReferralCode({
    externalUserId: user,
    requestKey: "referral-code-request-0001",
    code: "ABCDEFGH23",
  });
  for (let index = 1; index <= 3; index += 1) {
    const invitee = `phone:${String(index).repeat(64)}`;
    dataSource.register(
      invitee,
      `00000000-0000-4000-8000-${String(index + 200).padStart(12, "0")}`,
    );
    const result = await service.qualifyReferral({
      inviteeExternalUserId: invitee,
      requestKey: `referral-qualification-${index}`,
      code: code.code,
      deviceKeyHash: createHash("sha256")
        .update(`device-${index}`)
        .digest("hex"),
    });
    assert.equal(result.qualifiedCount, index);
    assert.equal(result.rewardGranted, index === 3);
  }
  const balance = await service.getCreditBalance(user);
  assert.equal(balance.referralAvailable, 1);
  const experience = await service.reserveGeneration({
    externalUserId: user,
    memoryId: "00000000-0000-4000-8000-000000000101",
    requestKey: "referral-experience-reserve",
    generationKey: "referral-experience-generation",
    purpose: "referral_experience",
  });
  assert.equal(experience.saveAllowed, false);

  const fourth = `phone:${"4".repeat(64)}`;
  dataSource.register(
    fourth,
    "00000000-0000-4000-8000-000000000204",
  );
  await assert.rejects(
    () =>
      service.qualifyReferral({
        inviteeExternalUserId: fourth,
        requestKey: "referral-qualification-4",
        code: code.code,
        deviceKeyHash: createHash("sha256").update("device-1").digest("hex"),
      }),
    /already used/,
  );
  await assert.rejects(
    () =>
      service.qualifyReferral({
        inviteeExternalUserId: `wechat:${"5".repeat(64)}`,
        requestKey: "referral-qualification-5",
        code: code.code,
        deviceKeyHash: createHash("sha256").update("device-5").digest("hex"),
      }),
    /Verified phone/,
  );
});

test("an occasion reward is user-claimed once per year, saveable, and releases on failed generation", async () => {
  const { service, user } = fixture();
  const memoryId = "00000000-0000-4000-8000-000000000101";
  const now = new Date("2026-05-10T03:00:00.000Z");
  const reward = await service.claimOccasionReward({
    externalUserId: user,
    requestKey: "occasion-mothers-day-claim-0001",
    occasion: "mothers_day",
    now,
  });
  assert.equal(reward.saveAllowed, true);
  assert.equal((await service.getCreditBalance(user)).occasionAvailable, 1);
  const repeated = await service.claimOccasionReward({
    externalUserId: user,
    requestKey: "occasion-mothers-day-claim-0002",
    occasion: "mothers_day",
    now,
  });
  assert.equal(repeated.claimedAt, reward.claimedAt);
  const reservation = await service.reserveGeneration({
    externalUserId: user,
    memoryId,
    requestKey: "occasion-mothers-day-reserve-0001",
    generationKey: "occasion-mothers-day-generation-0001",
    purpose: "occasion_experience",
  });
  assert.equal(reservation.saveAllowed, true);
  await service.settleGeneration({
    externalUserId: user,
    requestKey: "occasion-mothers-day-reserve-0001",
    outcome: "system_failed",
  });
  assert.equal((await service.getCreditBalance(user)).occasionAvailable, 1);
  await assert.rejects(
    () => service.claimOccasionReward({
      externalUserId: user,
      requestKey: "occasion-fathers-day-claim-0001",
      occasion: "fathers_day",
      now,
    }),
    /OCCASION_CLAIM_NOT_OPEN/,
  );
});

test("reconciliation reports ledger drift without mutating balances", async () => {
  const { dataSource, service, user } = fixture();
  const created = await service.createOrder({
    externalUserId: user,
    requestKey: "reconcile-order-0001",
    productId: "memory_video_199",
    platform: "web",
    adapter: new TestCommercePaymentAdapter({
      NODE_ENV: "test",
      COMMERCE_TEST_MODE: "true",
    }),
  });
  await service.applyPaymentEvent(
    "test",
    paymentEvent(created.order, "reconcile-event"),
  );
  assert.equal((await service.reconcileOrders()).issues.length, 0);
  dataSource.corruptPaidLot = true;
  const report = await service.reconcileOrders(
    new Date("2026-07-27T12:00:00.000Z"),
  );
  assert.deepEqual(report.issues.map((issue) => issue.code), [
    "PAID_ORDER_CREDIT_MISMATCH",
  ]);
  assert.equal((await service.getCreditBalance(user)).paidAvailable, 15);
});
