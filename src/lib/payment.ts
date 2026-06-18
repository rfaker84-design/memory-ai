// ╔══════════════════════════════════════════════════════════════╗
// ║  payment.ts — 支付系统 (V4 商业闭环)                       ║
// ║  支持微信支付（优先）/ Stripe / 订单管理 / 回调处理        ║
// ╚══════════════════════════════════════════════════════════════╝

import { createClient } from "@supabase/supabase-js";
import { updateUserTier } from "./auth";

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}

// ═══════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════
export type PaymentProvider = "wechat" | "stripe" | "mock";

export type PlanType = "free" | "pro" | "vip";

export interface PlanPricing {
  plan: PlanType;
  name: string;
  monthlyPrice: number;        // 分
  yearlyPrice: number;         // 分（年付优惠）
  features: string[];
  popular: boolean;
}

export const PLAN_PRICING: PlanPricing[] = [
  {
    plan: "free",
    name: "免费版",
    monthlyPrice: 0,
    yearlyPrice: 0,
    features: [
      "每日 20 次对话",
      "基础文字回复",
      "静态头像",
      "基础语音",
    ],
    popular: false,
  },
  {
    plan: "pro",
    name: "专业版",
    monthlyPrice: 2900,       // ¥29/月
    yearlyPrice: 29000,       // ¥290/年 (省¥58)
    features: [
      "每日 100 次对话",
      "高质量 AI 模型",
      "高清语音合成",
      "AI 生成头像",
      "记忆人格系统",
      "情绪深度交互",
    ],
    popular: true,
  },
  {
    plan: "vip",
    name: "VIP 版",
    monthlyPrice: 9900,       // ¥99/月
    yearlyPrice: 99000,       // ¥990/年 (省¥198)
    features: [
      "每日 500 次对话",
      "顶级 AI 模型",
      "实时数字人系统",
      "超高清语音",
      "完整人格演化",
      "多人格记忆网络",
      "长期记忆系统",
      "优先服务支持",
    ],
    popular: false,
  },
];

export interface PaymentOrder {
  orderId: string;
  userId: string;
  plan: PlanType;
  amount: number;              // 分
  provider: PaymentProvider;
  status: "pending" | "paid" | "failed" | "expired" | "refunded";
  createdAt: string;
  paidAt?: string;
  transactionId?: string;
}

export interface PaymentResult {
  success: boolean;
  orderId?: string;
  payUrl?: string;            // 微信支付链接
  qrCode?: string;            // 二维码（微信）
  error?: string;
}

// ═══════════════════════════════════════════════════════════════
// 创建订单
// ═══════════════════════════════════════════════════════════════
export async function createOrder(
  userId: string,
  plan: PlanType,
  billing: "monthly" | "yearly",
  provider: PaymentProvider = "wechat",
): Promise<PaymentResult> {
  const pricing = PLAN_PRICING.find(p => p.plan === plan);
  if (!pricing) return { success: false, error: "无效套餐" };

  const amount = billing === "yearly" ? pricing.yearlyPrice : pricing.monthlyPrice;
  if (amount <= 0) return { success: false, error: "免费套餐无需支付" };

  const orderId = "ord_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 8);
  const supabase = getSupabase();

  const { error } = await supabase.from("payment_orders").insert({
    id: orderId,
    user_id: userId,
    plan_type: plan,
    amount,
    provider,
    status: "pending",
    billing_cycle: billing,
    created_at: new Date().toISOString(),
  });

  if (error) {
    return { success: false, error: "创建订单失败: " + error.message };
  }

  // 生成支付链接（mock 模式直接标记为已支付）
  if (provider === "mock") {
    await completeOrder(orderId);
    return { success: true, orderId };
  }

  // 微信支付 URL（生产环境接入微信支付 SDK）
  const payUrl = provider === "wechat"
    ? generateWechatPayUrl(orderId, amount, plan)
    : generateStripePayUrl(orderId, amount, plan);

  return {
    success: true,
    orderId,
    payUrl,
  };
}

// ═══════════════════════════════════════════════════════════════
// 完成支付（回调处理）
// ═══════════════════════════════════════════════════════════════
export async function completeOrder(
  orderId: string,
  transactionId?: string,
): Promise<{ success: boolean; plan?: PlanType; error?: string }> {
  const supabase = getSupabase();

  // 获取订单
  const { data: order } = await supabase
    .from("payment_orders")
    .select("*")
    .eq("id", orderId)
    .maybeSingle();

  if (!order) return { success: false, error: "订单不存在" };

  if (order.status === "paid") {
    return { success: true, plan: order.plan_type as PlanType };
  }

  // 更新订单状态
  const { error } = await supabase
    .from("payment_orders")
    .update({
      status: "paid",
      paid_at: new Date().toISOString(),
      transaction_id: transactionId || "mock_" + orderId,
    })
    .eq("id", orderId);

  if (error) return { success: false, error: "更新订单失败" };

  // 升级用户等级
  const plan = order.plan_type as PlanType;
  await updateUserTier(order.user_id, plan);

  return { success: true, plan };
}

// ═══════════════════════════════════════════════════════════════
// 获取用户订单历史
// ═══════════════════════════════════════════════════════════════
export async function getUserOrders(userId: string): Promise<PaymentOrder[]> {
  const supabase = getSupabase();

  const { data } = await supabase
    .from("payment_orders")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(50);

  if (!data) return [];

  return data.map((o: Record<string, unknown>) => ({
    orderId: o.id as string,
    userId: o.user_id as string,
    plan: (o.plan_type as PlanType) || "free",
    amount: o.amount as number,
    provider: (o.provider as PaymentProvider) || "mock",
    status: (o.status as PaymentOrder["status"]) || "pending",
    createdAt: o.created_at as string,
    paidAt: (o.paid_at as string) || undefined,
    transactionId: (o.transaction_id as string) || undefined,
  }));
}

// ═══════════════════════════════════════════════════════════════
// 收入统计（管理员）
// ═══════════════════════════════════════════════════════════════
export async function getRevenueStats(): Promise<{
  today: number;
  thisMonth: number;
  total: number;
  orderCount: number;
}> {
  const supabase = getSupabase();
  const today = new Date().toISOString().slice(0, 10);
  const monthStart = new Date().toISOString().slice(0, 7) + "-01";

  const { data: paidOrders } = await supabase
    .from("payment_orders")
    .select("amount, status, paid_at, created_at")
    .eq("status", "paid");

  const orderList = (paidOrders as Array<Record<string, unknown>>) || [];
  if (orderList.length === 0) return { today: 0, thisMonth: 0, total: 0, orderCount: 0 };

  let todayAmount = 0;
  let monthAmount = 0;
  let totalAmount = 0;

  for (const o of orderList) {
    const amount = (o.amount as number) || 0;
    totalAmount += amount;

    const paidAt = (o.paid_at as string) || "";
    if (paidAt.startsWith(today)) todayAmount += amount;
    if (paidAt >= monthStart) monthAmount += amount;
  }

  return {
    today: todayAmount,
    thisMonth: monthAmount,
    total: totalAmount,
    orderCount: orderList.length,
  };
}

// ═══════════════════════════════════════════════════════════════
// Helpers：支付链接生成
// ═══════════════════════════════════════════════════════════════
function generateWechatPayUrl(orderId: string, amount: number, plan: string): string {
  // 生产环境：调用微信支付统一下单 API
  // 开发环境：使用 mock 回调
  const base = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";
  const callbackUrl = encodeURIComponent(`${base}/api/payment/callback?orderId=${orderId}`);
  return `${base}/api/payment/pay?orderId=${orderId}&amount=${amount}&plan=${plan}`;
}

function generateStripePayUrl(orderId: string, amount: number, plan: string): string {
  const base = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";
  return `${base}/api/payment/stripe-checkout?orderId=${orderId}&amount=${amount}&plan=${plan}`;
}
