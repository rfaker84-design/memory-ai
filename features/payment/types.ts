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

export type RefundRequestStatus = "processing" | "succeeded" | "rejected";

export type RefundRequest = {
  id: string;
  memoryId: string;
  orderNo: string;
  status: RefundRequestStatus;
  eligibility: "eligible" | "ineligible";
  reason: string;
  rejectionReason: string | null;
  createdAt: string;
  resolvedAt: string | null;
};

export type CreateRefundRequestInput = {
  externalUserId: string;
  memoryId: string;
  orderNo: string;
  reason: string;
  requestKey: string;
};

export type ChatQuotaReservation = "free" | "reserved" | "unavailable";
