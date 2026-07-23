export type PaymentProduct = {
  id: string;
  priceFen: number;
  durationDays: number;
  chatQuota: number;
};

export type PaymentOrderStatus = "pending" | "paid" | "failed" | "cancelled" | "refunded" | "expired";

export type PaymentOrder = {
  id: string;
  memoryId: string;
  orderNo: string;
  productId: string;
  amountFen: number;
  currency: "CNY";
  durationDays: number;
  chatQuota: number;
  status: PaymentOrderStatus;
  paymentUrl: string | null;
  expiresAt: string;
  paidAt: string | null;
  refundedAt: string | null;
  createdAt: string;
};

export type MemoryEntitlement = {
  id: string;
  memoryId: string;
  orderNo: string;
  productId: string;
  startsAt: string;
  endsAt: string;
  chatQuota: number;
  chatUsed: number;
  status: "active" | "refunded";
};

export type CreatePaymentOrderInput = {
  externalUserId: string;
  memoryId: string;
  requestKey: string;
  product: PaymentProduct;
  now?: Date;
  orderNo?: string;
};

export type WeChatCheckout = {
  prepayId: string | null;
  paymentUrl: string;
};

export type PaymentCallback = {
  eventId: string;
  kind: "transaction" | "refund";
  orderNo: string;
  refundRequestNo?: string;
  refundId?: string;
  transactionId: string;
  status: "success" | "failed" | "cancelled" | "refunded";
  amountFen: number;
  payloadHash: string;
};

export type PaymentSettlement = {
  outcome: "paid" | "refunded" | "failed" | "cancelled" | "duplicate";
  externalUserId: string;
  memoryId: string;
  orderNo: string;
};

export type RefundRequestStatus = "processing" | "requested" | "manual_review" | "succeeded" | "rejected";
export type RefundEligibility = "eligible" | "manual_review" | "ineligible";
export const REFUND_REQUEST_REASONS = [
  "unused_purchase",
  "duplicate_charge",
  "entitlement_missing",
  "service_failure",
] as const;
export type RefundRequestReason = (typeof REFUND_REQUEST_REASONS)[number];
export function isRefundRequestReason(value: unknown): value is RefundRequestReason {
  return typeof value === "string" && (REFUND_REQUEST_REASONS as readonly string[]).includes(value);
}

export type RefundRequest = {
  id: string;
  memoryId: string;
  orderNo: string;
  amountFen: number;
  merchantRefundNo: string;
  status: RefundRequestStatus;
  eligibility: RefundEligibility;
  reason: RefundRequestReason;
  decisionCode: string | null;
  providerRefundId: string | null;
  createdAt: string;
  requestedAt: string | null;
  resolvedAt: string | null;
};

export type WeChatRefund = { providerRefundId: string | null };

export type RefundReviewAction = "approve" | "reject";
export type ReviewManualRefundInput = { refundId: string; action: RefundReviewAction };
export type ManualRefundApproval = { refund: RefundRequest; shouldCallProvider: boolean };

export type CreateRefundRequestInput = {
  externalUserId: string;
  memoryId: string;
  orderNo: string;
  reason: RefundRequestReason;
  requestKey: string;
};

export type ChatQuotaReservation = "free" | "reserved" | "unavailable";
