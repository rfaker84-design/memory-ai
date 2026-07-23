import type {
  CreatePaymentOrderInput,
  MemoryEntitlement,
  PaymentCallback,
  PaymentOrder,
  PaymentSettlement,
  RefundRequest,
  CreateRefundRequestInput,
  WeChatCheckout,
} from "./types";

export interface PaymentDataSource {
  createOrder(input: CreatePaymentOrderInput): Promise<PaymentOrder>;
  attachCheckout(orderNo: string, checkout: WeChatCheckout): Promise<PaymentOrder>;
  markCheckoutFailure(orderNo: string): Promise<void>;
  listOrders(externalUserId: string, memoryId: string): Promise<PaymentOrder[]>;
  listEntitlements(externalUserId: string, memoryId: string): Promise<MemoryEntitlement[]>;
  applyCallback(callback: PaymentCallback): Promise<PaymentSettlement>;
  createRefundRequest(input: CreateRefundRequestInput): Promise<RefundRequest>;
  listRefundRequests(externalUserId: string, memoryId: string): Promise<RefundRequest[]>;
  reserveChatQuota(input: { externalUserId: string; memoryId: string; idempotencyKey: string }): Promise<import("./types").ChatQuotaReservation>;
  releaseChatQuota(input: { externalUserId: string; memoryId: string; idempotencyKey: string }): Promise<void>;
}
