import type {
  CommerceOrder,
  CommercePaymentEvent,
  CommerceRefundRequest,
  CommerceSettlement,
  CreateCommerceOrderInput,
  CreditBalance,
  GenerationPurpose,
  GenerationReservation,
  GenerationSettlementOutcome,
  OccasionKind,
  OccasionReward,
  OccasionRewardOffer,
  PhotoRemedyGrant,
  PhotoRemedyInput,
  ReconciliationReport,
  ReferralCode,
  ReferralQualification,
  ReferralStatus,
} from "./types";

export interface CommerceDataSource {
  createOrder(input: CreateCommerceOrderInput): Promise<CommerceOrder>;
  listOrders(externalUserId: string): Promise<CommerceOrder[]>;
  applyPaymentEvent(
    rail: CommerceOrder["paymentRail"],
    event: CommercePaymentEvent,
  ): Promise<CommerceSettlement>;
  requestRefund(input: {
    externalUserId: string;
    orderNo: string;
    requestKey: string;
    reason: CommerceRefundRequest["reason"];
  }): Promise<CommerceRefundRequest>;
  getCreditBalance(externalUserId: string): Promise<CreditBalance>;
  reserveGeneration(input: {
    externalUserId: string;
    memoryId: string;
    requestKey: string;
    generationKey: string;
    purpose: GenerationPurpose;
  }): Promise<GenerationReservation>;
  settleGeneration(input: {
    externalUserId: string;
    requestKey: string;
    outcome: GenerationSettlementOutcome;
  }): Promise<GenerationReservation>;
  recoverGeneration(
    externalUserId: string,
    requestKey: string,
  ): Promise<GenerationReservation | null>;
  requestPhotoRemedy(input: PhotoRemedyInput): Promise<PhotoRemedyGrant>;
  canSaveGeneration(
    externalUserId: string,
    generationKey: string,
  ): Promise<boolean>;
  createReferralCode(input: {
    externalUserId: string;
    requestKey: string;
    code?: string;
  }): Promise<ReferralCode>;
  qualifyReferral(input: {
    inviteeExternalUserId: string;
    requestKey: string;
    code: string;
    deviceKeyHash: string;
  }): Promise<ReferralQualification>;
  getReferralStatus(externalUserId: string): Promise<ReferralStatus>;
  claimOccasionReward(input: {
    externalUserId: string;
    requestKey: string;
    occasion: OccasionKind;
    now?: Date;
  }): Promise<OccasionReward>;
  listOpenOccasionRewardOffers(input: {
    externalUserId: string;
    now?: Date;
  }): Promise<OccasionRewardOffer[]>;
  reconcileOrders(now?: Date): Promise<ReconciliationReport>;
}
