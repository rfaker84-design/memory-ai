import type { CommerceDataSource } from "./commerce-datasource";
import type {
  CommercePaymentEvent,
  CommerceRefundRequest,
  CreateCommerceOrderInput,
  GenerationPurpose,
  GenerationSettlementOutcome,
  OccasionKind,
  OccasionRewardOffer,
  PhotoRemedyInput,
} from "./types";

export class CommerceRepository {
  constructor(private readonly dataSource: CommerceDataSource) {}

  createOrder(input: CreateCommerceOrderInput) {
    return this.dataSource.createOrder(input);
  }
  listOrders(externalUserId: string) {
    return this.dataSource.listOrders(externalUserId);
  }
  applyPaymentEvent(
    rail: CreateCommerceOrderInput["paymentRail"],
    event: CommercePaymentEvent,
  ) {
    return this.dataSource.applyPaymentEvent(rail, event);
  }
  requestRefund(input: {
    externalUserId: string;
    orderNo: string;
    requestKey: string;
    reason: CommerceRefundRequest["reason"];
  }) {
    return this.dataSource.requestRefund(input);
  }
  getCreditBalance(externalUserId: string) {
    return this.dataSource.getCreditBalance(externalUserId);
  }
  reserveGeneration(input: {
    externalUserId: string;
    memoryId: string;
    requestKey: string;
    generationKey: string;
    purpose: GenerationPurpose;
  }) {
    return this.dataSource.reserveGeneration(input);
  }
  settleGeneration(input: {
    externalUserId: string;
    requestKey: string;
    outcome: GenerationSettlementOutcome;
  }) {
    return this.dataSource.settleGeneration(input);
  }
  recoverGeneration(externalUserId: string, requestKey: string) {
    return this.dataSource.recoverGeneration(externalUserId, requestKey);
  }
  requestPhotoRemedy(input: PhotoRemedyInput) {
    return this.dataSource.requestPhotoRemedy(input);
  }
  canSaveGeneration(externalUserId: string, generationKey: string) {
    return this.dataSource.canSaveGeneration(externalUserId, generationKey);
  }
  createReferralCode(input: {
    externalUserId: string;
    requestKey: string;
    code?: string;
  }) {
    return this.dataSource.createReferralCode(input);
  }
  qualifyReferral(input: {
    inviteeExternalUserId: string;
    requestKey: string;
    code: string;
    deviceKeyHash: string;
  }) {
    return this.dataSource.qualifyReferral(input);
  }
  getReferralStatus(externalUserId: string) {
    return this.dataSource.getReferralStatus(externalUserId);
  }
  claimOccasionReward(input: {
    externalUserId: string;
    requestKey: string;
    occasion: OccasionKind;
    now?: Date;
  }) {
    return this.dataSource.claimOccasionReward(input);
  }
  listOpenOccasionRewardOffers(input: {
    externalUserId: string;
    now?: Date;
  }): Promise<OccasionRewardOffer[]> {
    return this.dataSource.listOpenOccasionRewardOffers(input);
  }
  reconcileOrders(now?: Date) {
    return this.dataSource.reconcileOrders(now);
  }
}
