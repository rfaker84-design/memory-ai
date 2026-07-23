export type PaymentOrderStatus = "pending" | "paid" | "failed" | "cancelled" | "refunded" | "expired";

export type PaymentOrder = {
  orderNo: string;
  status: PaymentOrderStatus;
  paymentUrl: string | null;
};

export type MemoryEntitlement = {
  endsAt: string;
  chatQuota: number;
  chatUsed: number;
  status: "active" | "refunded";
};

export type PaymentSnapshot = {
  orders: PaymentOrder[];
  entitlements: MemoryEntitlement[];
};

export type RefundRequest = {
  id: string;
  memoryId: string;
  orderNo: string;
  status: "processing" | "succeeded" | "rejected";
  eligibility: "eligible" | "ineligible";
  reason: string;
  rejectionReason: string | null;
  createdAt: string;
  resolvedAt: string | null;
};

export class PaymentExperienceRequestError extends Error {
  constructor(readonly status: number, readonly code: string) {
    super(code);
  }
}

async function responseBody(response: Response): Promise<Record<string, unknown>> {
  return response.json().catch(() => ({})) as Promise<Record<string, unknown>>;
}

function records(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value)
    ? value.filter((item): item is Record<string, unknown> => typeof item === "object" && item !== null && !Array.isArray(item))
    : [];
}

function orders(value: unknown): PaymentOrder[] {
  return records(value).flatMap((item) => (
    typeof item.orderNo === "string" && typeof item.status === "string"
      ? [{ orderNo: item.orderNo, status: item.status as PaymentOrderStatus, paymentUrl: typeof item.paymentUrl === "string" ? item.paymentUrl : null }]
      : []
  ));
}

function entitlements(value: unknown): MemoryEntitlement[] {
  return records(value).flatMap((item) => (
    typeof item.endsAt === "string" && typeof item.chatQuota === "number" && typeof item.chatUsed === "number" && (item.status === "active" || item.status === "refunded")
      ? [{ endsAt: item.endsAt, chatQuota: item.chatQuota, chatUsed: item.chatUsed, status: item.status }]
      : []
  ));
}

function refunds(value: unknown): RefundRequest[] {
  return records(value).flatMap((item) => (
    typeof item.id === "string" && typeof item.memoryId === "string" && typeof item.orderNo === "string"
      && (item.status === "processing" || item.status === "succeeded" || item.status === "rejected")
      && (item.eligibility === "eligible" || item.eligibility === "ineligible")
      && typeof item.reason === "string" && typeof item.createdAt === "string"
      ? [{ id: item.id, memoryId: item.memoryId, orderNo: item.orderNo, status: item.status, eligibility: item.eligibility,
        reason: item.reason, rejectionReason: typeof item.rejectionReason === "string" ? item.rejectionReason : null,
        createdAt: item.createdAt, resolvedAt: typeof item.resolvedAt === "string" ? item.resolvedAt : null }]
      : []
  ));
}

export async function loadPaymentSnapshot(memoryId: string, request: typeof fetch = fetch): Promise<PaymentSnapshot> {
  const query = `memoryId=${encodeURIComponent(memoryId)}`;
  const [ordersResponse, entitlementsResponse] = await Promise.all([
    request(`/api/payments/orders?${query}`, { credentials: "same-origin", cache: "no-store" }),
    request(`/api/payments/entitlements?${query}`, { credentials: "same-origin", cache: "no-store" }),
  ]);
  const [ordersBody, entitlementsBody] = await Promise.all([responseBody(ordersResponse), responseBody(entitlementsResponse)]);
  if (!ordersResponse.ok) throw new PaymentExperienceRequestError(ordersResponse.status, typeof ordersBody.error === "string" ? ordersBody.error : "PAYMENT_STATUS_FAILED");
  if (!entitlementsResponse.ok) throw new PaymentExperienceRequestError(entitlementsResponse.status, typeof entitlementsBody.error === "string" ? entitlementsBody.error : "PAYMENT_STATUS_FAILED");
  return { orders: orders(ordersBody.orders), entitlements: entitlements(entitlementsBody.entitlements) };
}

export async function createExperienceCheckout(memoryId: string, idempotencyKey: string, request: typeof fetch = fetch): Promise<string> {
  const response = await request("/api/payments/orders", {
    method: "POST",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json", "Idempotency-Key": idempotencyKey },
    body: JSON.stringify({ memoryId }),
  });
  const body = await responseBody(response);
  const order = typeof body.order === "object" && body.order !== null ? body.order as Record<string, unknown> : null;
  const paymentUrl = order?.paymentUrl;
  if (!response.ok || typeof paymentUrl !== "string") {
    throw new PaymentExperienceRequestError(response.status, typeof body.error === "string" ? body.error : "PAYMENT_ORDER_FAILED");
  }
  const destination = new URL(paymentUrl);
  if (destination.protocol !== "https:") throw new PaymentExperienceRequestError(0, "UNSAFE_PAYMENT_URL");
  return destination.toString();
}

export async function loadRefundRequests(memoryId: string, request: typeof fetch = fetch): Promise<RefundRequest[]> {
  const response = await request(`/api/payments/refunds?memoryId=${encodeURIComponent(memoryId)}`, { credentials: "same-origin", cache: "no-store" });
  const body = await responseBody(response);
  if (!response.ok) throw new PaymentExperienceRequestError(response.status, typeof body.error === "string" ? body.error : "REFUND_STATUS_FAILED");
  return refunds(body.refunds);
}

export async function createRefundRequest(
  input: { memoryId: string; orderNo: string; reason: string; idempotencyKey: string },
  request: typeof fetch = fetch,
): Promise<RefundRequest> {
  const response = await request("/api/payments/refunds", {
    method: "POST", credentials: "same-origin",
    headers: { "Content-Type": "application/json", "Idempotency-Key": input.idempotencyKey },
    body: JSON.stringify({ memoryId: input.memoryId, orderNo: input.orderNo, reason: input.reason }),
  });
  const body = await responseBody(response);
  const refund = typeof body.refund === "object" && body.refund !== null ? refunds([body.refund])[0] : undefined;
  if (!response.ok || !refund) throw new PaymentExperienceRequestError(response.status, typeof body.error === "string" ? body.error : "REFUND_REQUEST_FAILED");
  return refund;
}

export function createPaymentIdempotencyKey() {
  const random = typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `payment-${random}`;
}

export function createRefundIdempotencyKey() {
  const random = typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `refund-${random}`;
}

export function describeRefundRequest(refund: RefundRequest): { title: string; detail: string } {
  if (refund.status === "succeeded") return { title: "退款已完成", detail: "支付渠道已确认退款。退款成功后，体验权益立即终止。" };
  if (refund.status === "rejected") return { title: "本次不符合受理条件", detail: refund.rejectionReason ?? "当前订单不符合退款申请条件。" };
  return { title: "退款申请处理中", detail: "系统已记录申请并核验订单；支付渠道确认退款后会在这里更新结果。" };
}

export type ExperienceStatus = {
  title: string;
  detail: string;
  canPurchase: boolean;
};

function readableDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "权益到期日" : new Intl.DateTimeFormat("zh-CN", { year: "numeric", month: "long", day: "numeric" }).format(date);
}

export function describeExperienceStatus(snapshot: PaymentSnapshot): ExperienceStatus {
  const active = snapshot.entitlements.find((item) => item.status === "active");
  if (active) {
    const remaining = Math.max(0, active.chatQuota - active.chatUsed);
    return { title: "忆见初遇体验进行中", detail: `还可向 TA 说 ${remaining} 次，至 ${readableDate(active.endsAt)}。一次性购买，不自动续费。`, canPurchase: false };
  }
  if (snapshot.entitlements.some((item) => item.status === "refunded")) {
    return { title: "体验已退款", detail: "退款已处理；这份体验的权益已结束。", canPurchase: true };
  }
  const latest = snapshot.orders[0];
  if (!latest) return { title: "忆见初遇体验", detail: "49元 · 30天 · 1个 TA · 100次 AI 回复。一次性购买，不自动续费。", canPurchase: true };
  if (latest.status === "pending") return { title: "支付尚未完成", detail: "如已前往微信支付，完成后回到这里刷新状态；若取消支付，不会获得体验权益。", canPurchase: false };
  if (latest.status === "paid") return { title: "支付正在确认", detail: "支付已收到，正在确认 30 天和 100 次 AI 回复权益。请稍后刷新状态。", canPurchase: false };
  if (latest.status === "cancelled") return { title: "支付已取消", detail: "本次支付已取消，未获得体验权益。你可以在准备好时重新发起。", canPurchase: true };
  if (latest.status === "refunded") return { title: "体验已退款", detail: "退款已处理；这份体验的权益已结束。", canPurchase: true };
  if (latest.status === "expired") return { title: "支付已过期", detail: "本次订单未完成，未获得体验权益。你可以在准备好时重新发起。", canPurchase: true };
  return { title: "支付未完成", detail: "本次付款没有成功，未获得体验权益。你可以在准备好时重新发起。", canPurchase: true };
}
