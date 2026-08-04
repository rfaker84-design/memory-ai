/**
 * Historical chat-commerce quarantine.
 *
 * Formal payment and refund paths live under features/commerce and /api/commerce.
 * This former Supabase-backed module is retained only to make accidental legacy
 * imports fail closed; it never creates, completes, or reads an order.
 */

export type PaymentProvider = "wechat" | "stripe" | "mock";
export type PlanType = "free" | "pro" | "vip";

export interface PlanPricing {
  plan: PlanType;
  name: string;
  monthlyPrice: number;
  yearlyPrice: number;
  features: string[];
  popular: boolean;
}

export const PLAN_PRICING: readonly PlanPricing[] = [];

export interface PaymentOrder {
  orderId: string;
  userId: string;
  plan: PlanType;
  amount: number;
  provider: PaymentProvider;
  status: "pending" | "paid" | "failed" | "expired" | "refunded";
  createdAt: string;
  paidAt?: string;
  transactionId?: string;
}

export interface PaymentResult {
  success: boolean;
  orderId?: string;
  payUrl?: string;
  qrCode?: string;
  error?: string;
}

export const LEGACY_CHAT_COMMERCE_UNAVAILABLE = "LEGACY_CHAT_COMMERCE_UNAVAILABLE";

export async function createOrder(_userId: string, _plan: PlanType, _billing: "monthly" | "yearly", _provider: PaymentProvider = "wechat"): Promise<PaymentResult> {
  return { success: false, error: LEGACY_CHAT_COMMERCE_UNAVAILABLE };
}

export async function completeOrder(_orderId: string, _transactionId?: string): Promise<{ success: boolean; plan?: PlanType; error?: string }> {
  return { success: false, error: LEGACY_CHAT_COMMERCE_UNAVAILABLE };
}

export async function getUserOrders(_userId: string): Promise<PaymentOrder[]> {
  return [];
}

export async function getRevenueStats(): Promise<{ today: number; thisMonth: number; total: number; orderCount: number }> {
  return { today: 0, thisMonth: 0, total: 0, orderCount: 0 };
}
