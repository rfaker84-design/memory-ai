import type {
  CreatePaymentOrderInput,
  MemoryEntitlement,
  PaymentCallback,
  PaymentOrder,
  PaymentSettlement,
  WeChatCheckout,
} from "./types";

export interface PaymentDataSource {
  createOrder(input: CreatePaymentOrderInput): Promise<PaymentOrder>;
  attachCheckout(orderNo: string, checkout: WeChatCheckout): Promise<PaymentOrder>;
  markCheckoutFailure(orderNo: string): Promise<void>;
  listOrders(externalUserId: string, memoryId: string): Promise<PaymentOrder[]>;
  listEntitlements(externalUserId: string, memoryId: string): Promise<MemoryEntitlement[]>;
  applyCallback(callback: PaymentCallback): Promise<PaymentSettlement>;
  reserveChatQuota(input: { externalUserId: string; memoryId: string; idempotencyKey: string }): Promise<import("./types").ChatQuotaReservation>;
  releaseChatQuota(input: { externalUserId: string; memoryId: string; idempotencyKey: string }): Promise<void>;
}
