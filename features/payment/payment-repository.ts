import type { PaymentDataSource } from "./payment-datasource";
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

export class PaymentRepository {
  constructor(private readonly dataSource: PaymentDataSource) {}

  createOrder(input: CreatePaymentOrderInput): Promise<PaymentOrder> { return this.dataSource.createOrder(input); }
  attachCheckout(orderNo: string, checkout: WeChatCheckout): Promise<PaymentOrder> { return this.dataSource.attachCheckout(orderNo, checkout); }
  markCheckoutFailure(orderNo: string): Promise<void> { return this.dataSource.markCheckoutFailure(orderNo); }
  listOrders(externalUserId: string, memoryId: string): Promise<PaymentOrder[]> { return this.dataSource.listOrders(externalUserId, memoryId); }
  listEntitlements(externalUserId: string, memoryId: string): Promise<MemoryEntitlement[]> { return this.dataSource.listEntitlements(externalUserId, memoryId); }
  applyCallback(callback: PaymentCallback): Promise<PaymentSettlement> { return this.dataSource.applyCallback(callback); }
  createRefundRequest(input: CreateRefundRequestInput): Promise<RefundRequest> { return this.dataSource.createRefundRequest(input); }
  listRefundRequests(externalUserId: string, memoryId: string): Promise<RefundRequest[]> { return this.dataSource.listRefundRequests(externalUserId, memoryId); }
  reserveChatQuota(input: { externalUserId: string; memoryId: string; idempotencyKey: string }) { return this.dataSource.reserveChatQuota(input); }
  releaseChatQuota(input: { externalUserId: string; memoryId: string; idempotencyKey: string }) { return this.dataSource.releaseChatQuota(input); }
}
