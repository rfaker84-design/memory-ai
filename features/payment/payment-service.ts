import type { PaymentRepository } from "./payment-repository";
import type {
  CreatePaymentOrderInput,
  MemoryEntitlement,
  PaymentCallback,
  PaymentOrder,
  PaymentSettlement,
  RefundRequest,
  CreateRefundRequestInput,
  WeChatRefund,
  WeChatCheckout,
} from "./types";

export type CheckoutProvider = {
  createH5Checkout(input: { order: PaymentOrder; clientIp: string }): Promise<WeChatCheckout>;
};
export type RefundProvider = { createRefund(input: { refund: RefundRequest }): Promise<WeChatRefund> };

export class PaymentService {
  constructor(private readonly repository: PaymentRepository) {}

  async createCheckout(input: CreatePaymentOrderInput & { clientIp: string; provider: CheckoutProvider }): Promise<PaymentOrder> {
    const order = await this.repository.createOrder(input);
    if (order.status !== "pending") return order;
    if (order.paymentUrl) return order;
    try {
      const checkout = await input.provider.createH5Checkout({ order, clientIp: input.clientIp });
      return await this.repository.attachCheckout(order.orderNo, checkout);
    } catch (error) {
      await this.repository.markCheckoutFailure(order.orderNo);
      throw error;
    }
  }

  listOrders(externalUserId: string, memoryId: string): Promise<PaymentOrder[]> {
    return this.repository.listOrders(externalUserId, memoryId);
  }

  listEntitlements(externalUserId: string, memoryId: string): Promise<MemoryEntitlement[]> {
    return this.repository.listEntitlements(externalUserId, memoryId);
  }

  applyCallback(callback: PaymentCallback): Promise<PaymentSettlement> {
    return this.repository.applyCallback(callback);
  }

  async createRefundRequest(input: CreateRefundRequestInput & { provider: RefundProvider }): Promise<RefundRequest> {
    const refund = await this.repository.createRefundRequest(input);
    if (refund.status !== "processing") return refund;
    try {
      return await this.repository.markRefundRequested(
        refund.merchantRefundNo,
        await input.provider.createRefund({ refund }),
      );
    } catch {
      return this.repository.markRefundManualReview(refund.merchantRefundNo, "WECHAT_REFUND_CALL_FAILED");
    }
  }

  listRefundRequests(externalUserId: string, memoryId: string): Promise<RefundRequest[]> {
    return this.repository.listRefundRequests(externalUserId, memoryId);
  }

  reserveChatQuota(input: { externalUserId: string; memoryId: string; idempotencyKey: string }) {
    return this.repository.reserveChatQuota(input);
  }

  releaseChatQuota(input: { externalUserId: string; memoryId: string; idempotencyKey: string }): Promise<void> {
    return this.repository.releaseChatQuota(input);
  }
}
