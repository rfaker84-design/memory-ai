export const COMMERCE_PRODUCT_IDS = [
  "memory_video_49",
  "memory_video_99",
  "memory_video_199",
] as const;

export type CommerceProductId = (typeof COMMERCE_PRODUCT_IDS)[number];

export type CommerceProduct = {
  id: CommerceProductId;
  priceFen: 4900 | 9900 | 19900;
  generationCredits: 2 | 6 | 15;
  grantsFirstPreviewSave: true;
};

export type CommercePlatform = "web" | "android" | "ios";
export type CommercePaymentRail = "test" | "storekit_iap";
export type CommerceOrderStatus =
  | "pending"
  | "paid"
  | "failed"
  | "cancelled"
  | "refunded";

export type CommerceOrder = {
  id: string;
  orderNo: string;
  productId: CommerceProductId;
  platform: CommercePlatform;
  paymentRail: CommercePaymentRail;
  amountFen: number;
  currency: "CNY";
  generationCredits: number;
  grantsFirstPreviewSave: boolean;
  status: CommerceOrderStatus;
  providerTransactionId: string | null;
  createdAt: string;
  paidAt: string | null;
  refundedAt: string | null;
};

export type CheckoutAction =
  | {
      kind: "test_callback_required";
      orderNo: string;
      chargesMoney: false;
    }
  | {
      kind: "storekit_required";
      orderNo: string;
      appAccountToken: string;
      chargesMoney: false;
    };

export type CreateCommerceOrderInput = {
  externalUserId: string;
  requestKey: string;
  product: CommerceProduct;
  platform: CommercePlatform;
  paymentRail: CommercePaymentRail;
  now?: Date;
  orderNo?: string;
};

export type CommercePaymentEvent = {
  eventId: string;
  kind: "payment" | "refund";
  orderNo: string;
  refundRequestNo?: string;
  transactionId: string;
  status: "succeeded" | "failed" | "cancelled" | "refunded";
  amountFen: number;
  payloadHash: string;
};

export type CommerceSettlement = {
  outcome:
    | "paid"
    | "refunded"
    | "failed"
    | "cancelled"
    | "duplicate";
  orderNo: string;
};

export type CommerceRefundRequest = {
  id: string;
  orderNo: string;
  requestNo: string;
  reason: "unused_purchase" | "duplicate_charge" | "service_failure";
  status: "manual_review" | "requested" | "succeeded" | "rejected";
  createdAt: string;
  resolvedAt: string | null;
};

export type CreditSourceKind =
  | "paid_package"
  | "free_preview"
  | "photo_remedy"
  | "referral_reward";

export type GenerationPurpose =
  | "first_preview"
  | "new_video"
  | "photo_remedy"
  | "referral_experience";

export type GenerationSettlementOutcome =
  | "succeeded"
  | "system_failed"
  | "invalidated";

export type GenerationReservationStatus =
  | "reserved"
  | "consumed"
  | "released";

export type GenerationReservation = {
  id: string;
  memoryId: string;
  requestKey: string;
  generationKey: string;
  purpose: GenerationPurpose;
  sourceKind: CreditSourceKind;
  saveAllowed: boolean;
  status: GenerationReservationStatus;
  outcome: GenerationSettlementOutcome | null;
  createdAt: string;
  settledAt: string | null;
};

export type CreditBalance = {
  paidAvailable: number;
  referralAvailable: number;
  freePreviewAvailable: number;
  photoRemedyAvailable: number;
  totalAvailable: number;
  paidCreditsNeverExpire: true;
  canSaveFirstPreview: boolean;
};

export type PhotoRemedyInput = {
  externalUserId: string;
  memoryId: string;
  requestKey: string;
  originalGenerationKey: string;
  replacementPhotoDigest: string;
};

export type PhotoRemedyGrant = {
  memoryId: string;
  granted: true;
  saveAllowed: false;
};

export type ReferralCode = {
  code: string;
  createdAt: string;
};

export type ReferralQualification = {
  inviterExternalUserId: string;
  inviteeExternalUserId: string;
  qualifiedCount: number;
  rewardGranted: boolean;
  rewardCohort: number | null;
};

export type ReferralStatus = {
  code: string;
  qualifiedInvitees: number;
  rewardsGranted: number;
  inviteesUntilNextReward: number;
};

export type ReconciliationIssueCode =
  | "PAID_ORDER_CREDIT_LOT_MISSING"
  | "PAID_ORDER_CREDIT_MISMATCH"
  | "PAID_USER_SAVE_RIGHT_MISSING"
  | "REFUNDED_ORDER_CREDIT_STILL_ACTIVE"
  | "REFUNDED_ORDER_SAVE_RIGHT_STILL_ACTIVE"
  | "UNSETTLED_ORDER_HAS_ACTIVE_CREDIT";

export type ReconciliationIssue = {
  code: ReconciliationIssueCode;
  orderNo: string;
  detail: string;
};

export type ReconciliationReport = {
  checkedAt: string;
  ordersChecked: number;
  issues: ReconciliationIssue[];
};
