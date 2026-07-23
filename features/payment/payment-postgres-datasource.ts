import { createHash, randomBytes } from "node:crypto";

import type { PoolClient } from "pg";

import { queryPostgres, withPostgresTransaction } from "../../src/server/database";
import { PaymentNotFoundError, PaymentStateError, PaymentValidationError } from "./errors";
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

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{12}$/i;
const KEY_PATTERN = /^[A-Za-z0-9._:-]{16,128}$/;
const ORDER_PATTERN = /^YM[0-9]{14}[0-9A-F]{12}$/;

type OrderRow = {
  id: string; memory_id: string; order_no: string; product_id: string; amount_fen: number;
  currency: "CNY"; duration_days: number; chat_quota: number; status: PaymentOrder["status"];
  payment_url: string | null; expires_at: Date | string; paid_at: Date | string | null;
  refunded_at: Date | string | null; created_at: Date | string; external_id: string;
  user_id: string; provider: string; provider_transaction_id: string | null;
};
type EntitlementRow = {
  id: string; memory_id: string; order_no: string; product_id: string; starts_at: Date | string;
  ends_at: Date | string; chat_quota: number; chat_used: number; status: "active" | "refunded";
};
type RefundRequestRow = {
  id: string; memory_id: string; order_no: string; status: RefundRequest["status"];
  eligibility: RefundRequest["eligibility"]; reason: string; rejection_reason: string | null;
  created_at: Date | string; resolved_at: Date | string | null;
};

const orderColumns = `o.id, o.memory_id, o.order_no, o.product_id, o.amount_fen, o.currency,
  o.duration_days, o.chat_quota, o.status, o.payment_url, o.expires_at, o.paid_at,
  o.refunded_at, o.created_at, u.external_id, o.user_id, o.provider, o.provider_transaction_id`;

function iso(value: Date | string | null): string | null {
  if (value === null) return null;
  return value instanceof Date ? value.toISOString() : value;
}

function toOrder(row: OrderRow): PaymentOrder {
  return {
    id: row.id, memoryId: row.memory_id, orderNo: row.order_no, productId: row.product_id,
    amountFen: row.amount_fen, currency: row.currency, durationDays: row.duration_days,
    chatQuota: row.chat_quota, status: row.status, paymentUrl: row.payment_url,
    expiresAt: iso(row.expires_at)!, paidAt: iso(row.paid_at), refundedAt: iso(row.refunded_at),
    createdAt: iso(row.created_at)!,
  };
}

function toEntitlement(row: EntitlementRow): MemoryEntitlement {
  return {
    id: row.id, memoryId: row.memory_id, orderNo: row.order_no, productId: row.product_id,
    startsAt: iso(row.starts_at)!, endsAt: iso(row.ends_at)!, chatQuota: row.chat_quota,
    chatUsed: row.chat_used, status: row.status,
  };
}

function toRefundRequest(row: RefundRequestRow): RefundRequest {
  return {
    id: row.id, memoryId: row.memory_id, orderNo: row.order_no, status: row.status,
    eligibility: row.eligibility, reason: row.reason, rejectionReason: row.rejection_reason,
    createdAt: iso(row.created_at)!, resolvedAt: iso(row.resolved_at),
  };
}

function required(value: string, field: string, pattern?: RegExp): string {
  const normalized = value.trim();
  if (!normalized || (pattern && !pattern.test(normalized))) throw new PaymentValidationError(`${field} is invalid`);
  return normalized;
}

function paymentOrderNo(now: Date): string {
  const timestamp = now.toISOString().replace(/[-:TZ.]/g, "").slice(0, 14);
  return `YM${timestamp}${randomBytes(6).toString("hex").toUpperCase()}`;
}

async function lockOwnedMemory(client: PoolClient, externalUserId: string, memoryId: string): Promise<string> {
  const result = await client.query<{ user_id: string }>(
    `SELECT m.user_id FROM memories m JOIN users u ON u.id = m.user_id
     WHERE m.id = $1 AND u.external_id = $2 FOR KEY SHARE OF m`,
    [memoryId, externalUserId],
  );
  if (!result.rows[0]) throw new PaymentNotFoundError("Memory was not found");
  return result.rows[0].user_id;
}

async function lockOrderScope(client: PoolClient, externalUserId: string, memoryId: string, requestKey: string): Promise<void> {
  await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [
    `memoryai:payment-order:${externalUserId}:${memoryId}:${requestKey}`,
  ]);
}

function assertCallback(callback: PaymentCallback): PaymentCallback {
  required(callback.eventId, "eventId");
  required(callback.orderNo, "orderNo", ORDER_PATTERN);
  required(callback.transactionId, "transactionId");
  if (!/^[0-9a-f]{64}$/.test(callback.payloadHash)) throw new PaymentValidationError("payloadHash is invalid");
  if (!Number.isSafeInteger(callback.amountFen) || callback.amountFen < 1) {
    throw new PaymentValidationError("amountFen is invalid");
  }
  return callback;
}

export class PaymentPostgresDataSource implements PaymentDataSource {
  async createOrder(input: CreatePaymentOrderInput): Promise<PaymentOrder> {
    const externalUserId = required(input.externalUserId, "userId");
    const memoryId = required(input.memoryId, "memoryId", UUID_PATTERN);
    const requestKey = required(input.requestKey, "Idempotency-Key", KEY_PATTERN);
    const now = input.now ?? new Date();
    const orderNo = input.orderNo ? required(input.orderNo, "orderNo", ORDER_PATTERN) : paymentOrderNo(now);
    const product = input.product;
    if (!/^[A-Za-z0-9._-]{1,100}$/.test(product.id)
      || !Number.isInteger(product.priceFen) || product.priceFen < 1 || product.priceFen > 100_000_000
      || !Number.isInteger(product.durationDays) || product.durationDays < 1 || product.durationDays > 366
      || !Number.isInteger(product.chatQuota) || product.chatQuota < 1 || product.chatQuota > 1_000_000) {
      throw new PaymentValidationError("product is invalid");
    }
    const expiresAt = new Date(now.getTime() + 15 * 60 * 1000);

    return withPostgresTransaction(async (client) => {
      const userId = await lockOwnedMemory(client, externalUserId, memoryId);
      await lockOrderScope(client, externalUserId, memoryId, requestKey);
      const existing = await client.query<OrderRow>(
        `SELECT ${orderColumns} FROM payment_orders o JOIN users u ON u.id = o.user_id
         WHERE o.user_id = $1 AND o.memory_id = $2 AND o.request_key = $3 FOR UPDATE`,
        [userId, memoryId, requestKey],
      );
      if (existing.rows[0]) {
        const existingOrder = existing.rows[0];
        if (existingOrder.status === "pending" && new Date(existingOrder.expires_at).getTime() <= now.getTime()) {
          const expired = await client.query<OrderRow>(
            `UPDATE payment_orders o SET status = 'expired', updated_at = NOW()
             FROM users u WHERE o.id = $1 AND o.user_id = u.id RETURNING ${orderColumns}`,
            [existingOrder.id],
          );
          return toOrder(expired.rows[0]);
        }
        return toOrder(existingOrder);
      }
      const inserted = await client.query<OrderRow>(
        `WITH written AS (
           INSERT INTO payment_orders (
             user_id, memory_id, order_no, request_key, product_id, amount_fen, duration_days,
             chat_quota, expires_at
           ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *
         ) SELECT written.id, written.memory_id, written.order_no, written.product_id,
           written.amount_fen, written.currency, written.duration_days, written.chat_quota,
           written.status, written.payment_url, written.expires_at, written.paid_at,
           written.refunded_at, written.created_at, u.external_id, written.user_id,
           written.provider, written.provider_transaction_id
         FROM written JOIN users u ON u.id = written.user_id`,
        [userId, memoryId, orderNo, requestKey, product.id, product.priceFen, product.durationDays, product.chatQuota, expiresAt],
      );
      await client.query(
        `INSERT INTO public.business_funnel_events (user_id, memory_id, event_type, event_key)
         VALUES ($1, $2, 'order_created', $3)
         ON CONFLICT (event_type, event_key) DO NOTHING`,
        [userId, memoryId, `order_created:${inserted.rows[0].id}`],
      );
      return toOrder(inserted.rows[0]);
    });
  }

  async attachCheckout(orderNo: string, checkout: WeChatCheckout): Promise<PaymentOrder> {
    required(orderNo, "orderNo", ORDER_PATTERN);
    if ((checkout.prepayId !== null && !checkout.prepayId.trim()) || !checkout.paymentUrl.trim()) {
      throw new PaymentValidationError("checkout is invalid");
    }
    const result = await queryPostgres<OrderRow>(
      `UPDATE payment_orders o SET provider_prepay_id = $2, payment_url = $3, updated_at = NOW()
       FROM users u WHERE o.order_no = $1 AND o.user_id = u.id AND o.status = 'pending'
       RETURNING ${orderColumns}`,
      [orderNo, checkout.prepayId, checkout.paymentUrl],
    );
    if (!result.rows[0]) throw new PaymentStateError("Order is not pending");
    return toOrder(result.rows[0]);
  }

  async markCheckoutFailure(orderNo: string): Promise<void> {
    await queryPostgres(
      `UPDATE payment_orders SET status = 'failed', failed_at = NOW(), updated_at = NOW()
       WHERE order_no = $1 AND status = 'pending' AND provider_transaction_id IS NULL`,
      [required(orderNo, "orderNo", ORDER_PATTERN)],
    );
  }

  async listOrders(externalUserId: string, memoryId: string): Promise<PaymentOrder[]> {
    const owner = required(externalUserId, "userId");
    const id = required(memoryId, "memoryId", UUID_PATTERN);
    const result = await queryPostgres<OrderRow>(
      `SELECT ${orderColumns} FROM payment_orders o JOIN users u ON u.id = o.user_id
       WHERE u.external_id = $1 AND o.memory_id = $2 ORDER BY o.created_at DESC`, [owner, id],
    );
    return result.rows.map(toOrder);
  }

  async listEntitlements(externalUserId: string, memoryId: string): Promise<MemoryEntitlement[]> {
    const owner = required(externalUserId, "userId");
    const id = required(memoryId, "memoryId", UUID_PATTERN);
    const result = await queryPostgres<EntitlementRow>(
      `SELECT e.id, e.memory_id, o.order_no, e.product_id, e.starts_at, e.ends_at,
         e.chat_quota, e.chat_used, e.status
       FROM memory_entitlements e
       JOIN users u ON u.id = e.user_id
       JOIN payment_orders o ON o.id = e.order_id
       WHERE u.external_id = $1 AND e.memory_id = $2 ORDER BY e.ends_at DESC`, [owner, id],
    );
    return result.rows.map(toEntitlement);
  }

  async createRefundRequest(input: CreateRefundRequestInput): Promise<RefundRequest> {
    const externalUserId = required(input.externalUserId, "userId");
    const memoryId = required(input.memoryId, "memoryId", UUID_PATTERN);
    const orderNo = required(input.orderNo, "orderNo", ORDER_PATTERN);
    const requestKey = required(input.requestKey, "Idempotency-Key", KEY_PATTERN);
    const reason = required(input.reason, "reason");
    if (reason.length > 500) throw new PaymentValidationError("reason is invalid");

    return withPostgresTransaction(async (client) => {
      const orderResult = await client.query<OrderRow>(
        `SELECT ${orderColumns} FROM payment_orders o JOIN users u ON u.id = o.user_id
         WHERE u.external_id = $1 AND o.memory_id = $2 AND o.order_no = $3 FOR UPDATE`,
        [externalUserId, memoryId, orderNo],
      );
      const order = orderResult.rows[0];
      if (!order) throw new PaymentNotFoundError("Order was not found");
      await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [
        `memoryai:refund-request:${order.id}`,
      ]);
      const existing = await client.query<RefundRequestRow>(
        `SELECT r.id, r.memory_id, o.order_no, r.status, r.eligibility, r.reason,
                r.rejection_reason, r.created_at, r.resolved_at
         FROM refund_requests r JOIN payment_orders o ON o.id = r.order_id
         WHERE r.order_id = $1 LIMIT 1`,
        [order.id],
      );
      if (existing.rows[0]) return toRefundRequest(existing.rows[0]);

      const eligible = order.status === "paid";
      const rejectionReason = eligible ? null : "仅可为已完成付款且尚未退款的订单提交退款申请。";
      const inserted = await client.query<RefundRequestRow>(
        `WITH written AS (
           INSERT INTO refund_requests (
             user_id, memory_id, order_id, request_key, reason, status, eligibility, rejection_reason, resolved_at
           ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, CASE WHEN $6 = 'rejected' THEN NOW() ELSE NULL END)
           RETURNING *
         ) SELECT written.id, written.memory_id, o.order_no, written.status, written.eligibility,
                  written.reason, written.rejection_reason, written.created_at, written.resolved_at
           FROM written JOIN payment_orders o ON o.id = written.order_id`,
        [order.user_id, memoryId, order.id, requestKey, reason, eligible ? "processing" : "rejected", eligible ? "eligible" : "ineligible", rejectionReason],
      );
      return toRefundRequest(inserted.rows[0]);
    });
  }

  async listRefundRequests(externalUserId: string, memoryId: string): Promise<RefundRequest[]> {
    const owner = required(externalUserId, "userId");
    const id = required(memoryId, "memoryId", UUID_PATTERN);
    const result = await queryPostgres<RefundRequestRow>(
      `SELECT r.id, r.memory_id, o.order_no, r.status, r.eligibility, r.reason,
              r.rejection_reason, r.created_at, r.resolved_at
       FROM refund_requests r
       JOIN users u ON u.id = r.user_id
       JOIN payment_orders o ON o.id = r.order_id
       WHERE u.external_id = $1 AND r.memory_id = $2
       ORDER BY r.created_at DESC`, [owner, id],
    );
    return result.rows.map(toRefundRequest);
  }

  async applyCallback(input: PaymentCallback): Promise<PaymentSettlement> {
    const callback = assertCallback(input);
    return withPostgresTransaction(async (client) => {
      const orderResult = await client.query<OrderRow>(
        `SELECT ${orderColumns} FROM payment_orders o JOIN users u ON u.id = o.user_id
         WHERE o.order_no = $1 FOR UPDATE`, [callback.orderNo],
      );
      const order = orderResult.rows[0];
      if (!order) throw new PaymentNotFoundError("Order was not found");
      if (order.provider !== "wechat_h5" || order.amount_fen !== callback.amountFen) {
        throw new PaymentStateError("Callback does not match order");
      }
      const event = await client.query(
        `INSERT INTO payment_callback_events (provider, provider_event_id, order_id, event_type, payload_hash)
         VALUES ('wechat_h5', $1, $2, $3, $4) ON CONFLICT (provider, provider_event_id) DO NOTHING RETURNING id`,
        [callback.eventId, order.id, callback.kind, callback.payloadHash],
      );
      const base = { externalUserId: order.external_id, memoryId: order.memory_id, orderNo: order.order_no };
      if (!event.rows[0]) return { outcome: "duplicate", ...base };

      if (callback.kind === "refund") {
        if (callback.status !== "refunded") return { outcome: "failed", ...base };
        if (order.status !== "paid" || order.provider_transaction_id !== callback.transactionId) {
          throw new PaymentStateError("Refund does not match a paid order");
        }
        await client.query(
          `UPDATE payment_orders SET status = 'refunded', refunded_at = NOW(), updated_at = NOW() WHERE id = $1`, [order.id],
        );
        await client.query(
          `UPDATE memory_entitlements SET status = 'refunded', updated_at = NOW() WHERE order_id = $1`, [order.id],
        );
        await client.query(
          `UPDATE refund_requests SET status = 'succeeded', resolved_at = NOW(), updated_at = NOW()
           WHERE order_id = $1 AND status = 'processing'`, [order.id],
        );
        await client.query(
          `INSERT INTO audit_logs (user_id, memory_id, action, level, message, metadata)
           VALUES ($1, $2, 'payment.refunded', 'info', 'Payment refunded', $3::jsonb)`,
          [order.user_id, order.memory_id, JSON.stringify({ orderNo: order.order_no })],
        );
        await client.query(
          `INSERT INTO public.business_funnel_events (user_id, memory_id, event_type, event_key)
           VALUES ($1, $2, 'payment_refunded', $3)
           ON CONFLICT (event_type, event_key) DO NOTHING`,
          [order.user_id, order.memory_id, `payment_refunded:${order.id}`],
        );
        return { outcome: "refunded", ...base };
      }

      if (callback.status !== "success") {
        const status = callback.status === "cancelled" ? "cancelled" : "failed";
        if (order.status === "pending") {
          await client.query(
            `UPDATE payment_orders SET status = $2, cancelled_at = CASE WHEN $2 = 'cancelled' THEN NOW() ELSE cancelled_at END,
             failed_at = CASE WHEN $2 = 'failed' THEN NOW() ELSE failed_at END, updated_at = NOW() WHERE id = $1`,
            [order.id, status],
          );
        }
        return { outcome: status, ...base };
      }

      if (order.status === "paid" || order.status === "refunded") {
        if (order.provider_transaction_id !== callback.transactionId) throw new PaymentStateError("Transaction conflicts with order");
        return { outcome: "duplicate", ...base };
      }
      if (!["pending", "failed", "cancelled", "expired"].includes(order.status)) {
        throw new PaymentStateError("Order status is invalid");
      }
      await client.query(
        `UPDATE payment_orders SET status = 'paid', provider_transaction_id = $2, paid_at = NOW(), updated_at = NOW()
         WHERE id = $1`, [order.id, callback.transactionId],
      );
      await client.query(
        `INSERT INTO memory_entitlements (
           order_id, user_id, memory_id, product_id, starts_at, ends_at, chat_quota
         ) VALUES ($1, $2, $3, $4, NOW(), NOW() + ($5::text || ' days')::interval, $6)
         ON CONFLICT (order_id) DO NOTHING`,
        [order.id, order.user_id, order.memory_id, order.product_id, order.duration_days, order.chat_quota],
      );
      await client.query(
        `INSERT INTO audit_logs (user_id, memory_id, action, level, message, metadata)
         VALUES ($1, $2, 'payment.success', 'info', 'Payment settled', $3::jsonb)`,
        [order.user_id, order.memory_id, JSON.stringify({ orderNo: order.order_no, amountFen: order.amount_fen })],
      );
      await client.query(
        `INSERT INTO public.business_funnel_events (user_id, memory_id, event_type, event_key)
         VALUES ($1, $2, 'payment_completed', $3)
         ON CONFLICT (event_type, event_key) DO NOTHING`,
        [order.user_id, order.memory_id, `payment_completed:${order.id}`],
      );
      return { outcome: "paid", ...base };
    });
  }

  async reserveChatQuota(input: { externalUserId: string; memoryId: string; idempotencyKey: string }): Promise<import("./types").ChatQuotaReservation> {
    const externalUserId = required(input.externalUserId, "userId");
    const memoryId = required(input.memoryId, "memoryId", UUID_PATTERN);
    const key = required(input.idempotencyKey, "Idempotency-Key", KEY_PATTERN);
    return withPostgresTransaction(async (client) => {
      const userId = await lockOwnedMemory(client, externalUserId, memoryId);
      await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [
        `memoryai:payment-quota:${externalUserId}:${memoryId}:${key}`,
      ]);
      const existing = await client.query(
        `SELECT id FROM memory_entitlement_usages WHERE user_id = $1 AND memory_id = $2 AND idempotency_key = $3`,
        [userId, memoryId, key],
      );
      if (existing.rows[0]) return "reserved";
      const everEntitled = await client.query(
        `SELECT id FROM memory_entitlements WHERE user_id = $1 AND memory_id = $2 LIMIT 1`, [userId, memoryId],
      );
      if (!everEntitled.rows[0]) return "free";
      const entitlement = await client.query<{ id: string }>(
        `SELECT id FROM memory_entitlements
         WHERE user_id = $1 AND memory_id = $2 AND status = 'active' AND ends_at > NOW() AND chat_used < chat_quota
         ORDER BY ends_at ASC LIMIT 1 FOR UPDATE`, [userId, memoryId],
      );
      if (!entitlement.rows[0]) return "unavailable";
      await client.query(`UPDATE memory_entitlements SET chat_used = chat_used + 1, updated_at = NOW() WHERE id = $1`, [entitlement.rows[0].id]);
      await client.query(
        `INSERT INTO memory_entitlement_usages (entitlement_id, user_id, memory_id, idempotency_key)
         VALUES ($1, $2, $3, $4)`, [entitlement.rows[0].id, userId, memoryId, key],
      );
      return "reserved";
    });
  }

  async releaseChatQuota(input: { externalUserId: string; memoryId: string; idempotencyKey: string }): Promise<void> {
    const externalUserId = required(input.externalUserId, "userId");
    const memoryId = required(input.memoryId, "memoryId", UUID_PATTERN);
    const key = required(input.idempotencyKey, "Idempotency-Key", KEY_PATTERN);
    await withPostgresTransaction(async (client) => {
      const userId = await lockOwnedMemory(client, externalUserId, memoryId);
      await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [
        `memoryai:payment-quota:${externalUserId}:${memoryId}:${key}`,
      ]);
      const usage = await client.query<{ entitlement_id: string }>(
        `DELETE FROM memory_entitlement_usages WHERE user_id = $1 AND memory_id = $2 AND idempotency_key = $3
         RETURNING entitlement_id`, [userId, memoryId, key],
      );
      if (usage.rows[0]) {
        await client.query(
          `UPDATE memory_entitlements SET chat_used = GREATEST(chat_used - 1, 0), updated_at = NOW() WHERE id = $1`,
          [usage.rows[0].entitlement_id],
        );
      }
    });
  }
}
