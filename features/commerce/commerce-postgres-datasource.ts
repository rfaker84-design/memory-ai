import { randomBytes } from "node:crypto";

import type { PoolClient } from "pg";

import {
  queryPostgres,
  withPostgresTransaction,
} from "../../src/server/database";
import type { CommerceDataSource } from "./commerce-datasource";
import {
  CommerceNotFoundError,
  CommerceStateError,
  CommerceValidationError,
} from "./errors";
import type {
  CommerceOrder,
  CommercePaymentEvent,
  CommerceRefundRequest,
  CommerceSettlement,
  CreateCommerceOrderInput,
  CreditBalance,
  CreditSourceKind,
  GenerationPurpose,
  GenerationReservation,
  GenerationSettlementOutcome,
  PhotoRemedyGrant,
  PhotoRemedyInput,
  ReconciliationIssue,
  ReconciliationReport,
  ReferralCode,
  ReferralQualification,
  ReferralStatus,
} from "./types";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const KEY_PATTERN = /^[A-Za-z0-9._:-]{16,128}$/;
const ORDER_PATTERN = /^YC[0-9]{14}[0-9A-F]{12}$/;
const REFUND_PATTERN = /^YCR[0-9]{14}[0-9A-F]{10}$/;
const CODE_PATTERN = /^[A-HJ-NP-Z2-9]{10}$/;
const HASH_PATTERN = /^[0-9a-f]{64}$/;

type UserRow = {
  id: string;
  external_id: string;
  created_at: Date | string;
};

type OrderRow = {
  id: string;
  order_no: string;
  product_id: CommerceOrder["productId"];
  platform: CommerceOrder["platform"];
  payment_rail: CommerceOrder["paymentRail"];
  amount_fen: number;
  currency: "CNY";
  generation_credits: number;
  grants_first_preview_save: boolean;
  status: CommerceOrder["status"];
  provider_transaction_id: string | null;
  created_at: Date | string;
  paid_at: Date | string | null;
  refunded_at: Date | string | null;
  user_id: string;
};

type RefundRow = {
  id: string;
  order_no: string;
  request_key: string;
  request_no: string;
  reason: CommerceRefundRequest["reason"];
  status: CommerceRefundRequest["status"];
  created_at: Date | string;
  resolved_at: Date | string | null;
};

type ReservationRow = {
  id: string;
  memory_id: string;
  request_key: string;
  generation_key: string;
  purpose: GenerationPurpose;
  source_kind: CreditSourceKind;
  save_allowed: boolean;
  status: GenerationReservation["status"];
  outcome: GenerationSettlementOutcome | null;
  created_at: Date | string;
  settled_at: Date | string | null;
  credit_lot_id: string;
  user_id: string;
};

type ReferralQualificationRow = {
  inviter_external_id: string;
  invitee_external_id: string;
  reward_cohort: number | null;
};

const ORDER_COLUMNS = `o.id, o.order_no, o.product_id, o.platform,
  o.payment_rail, o.amount_fen, o.currency, o.generation_credits,
  o.grants_first_preview_save, o.status, o.provider_transaction_id,
  o.created_at, o.paid_at, o.refunded_at, o.user_id`;

const RESERVATION_COLUMNS = `r.id, r.memory_id, r.request_key,
  r.generation_key, r.purpose, l.source_kind, l.save_allowed, r.status,
  r.outcome, r.created_at, r.settled_at, r.credit_lot_id, r.user_id`;

function iso(value: Date | string | null): string | null {
  if (value === null) return null;
  return value instanceof Date ? value.toISOString() : value;
}

function order(row: OrderRow): CommerceOrder {
  return {
    id: row.id,
    orderNo: row.order_no,
    productId: row.product_id,
    platform: row.platform,
    paymentRail: row.payment_rail,
    amountFen: row.amount_fen,
    currency: row.currency,
    generationCredits: row.generation_credits,
    grantsFirstPreviewSave: row.grants_first_preview_save,
    status: row.status,
    providerTransactionId: row.provider_transaction_id,
    createdAt: iso(row.created_at)!,
    paidAt: iso(row.paid_at),
    refundedAt: iso(row.refunded_at),
  };
}

function refund(row: RefundRow): CommerceRefundRequest {
  return {
    id: row.id,
    orderNo: row.order_no,
    requestNo: row.request_no,
    reason: row.reason,
    status: row.status,
    createdAt: iso(row.created_at)!,
    resolvedAt: iso(row.resolved_at),
  };
}

function reservation(row: ReservationRow): GenerationReservation {
  return {
    id: row.id,
    memoryId: row.memory_id,
    requestKey: row.request_key,
    generationKey: row.generation_key,
    purpose: row.purpose,
    sourceKind: row.source_kind,
    saveAllowed: row.save_allowed,
    status: row.status,
    outcome: row.outcome,
    createdAt: iso(row.created_at)!,
    settledAt: iso(row.settled_at),
  };
}

function required(
  value: string,
  field: string,
  pattern?: RegExp,
): string {
  const normalized = value.trim();
  if (!normalized || (pattern && !pattern.test(normalized))) {
    throw new CommerceValidationError(`${field} is invalid`);
  }
  return normalized;
}

function commerceOrderNo(now: Date): string {
  const timestamp = now.toISOString().replace(/[-:TZ.]/g, "").slice(0, 14);
  return `YC${timestamp}${randomBytes(6).toString("hex").toUpperCase()}`;
}

function commerceRefundNo(now: Date): string {
  const timestamp = now.toISOString().replace(/[-:TZ.]/g, "").slice(0, 14);
  return `YCR${timestamp}${randomBytes(5).toString("hex").toUpperCase()}`;
}

async function lockUser(
  client: PoolClient,
  externalUserId: string,
): Promise<UserRow> {
  const result = await client.query<UserRow>(
    `SELECT id, external_id, created_at FROM public.users
     WHERE external_id = $1 FOR UPDATE`,
    [externalUserId],
  );
  if (!result.rows[0]) throw new CommerceNotFoundError("User was not found");
  return result.rows[0];
}

async function lockOwnedMemory(
  client: PoolClient,
  userId: string,
  memoryId: string,
): Promise<void> {
  const result = await client.query(
    `SELECT id FROM public.memories
     WHERE id = $1 AND user_id = $2 FOR KEY SHARE`,
    [memoryId, userId],
  );
  if (!result.rows[0]) throw new CommerceNotFoundError("Memory was not found");
}

function assertEvent(event: CommercePaymentEvent): CommercePaymentEvent {
  required(event.eventId, "eventId");
  required(event.orderNo, "orderNo", ORDER_PATTERN);
  required(event.transactionId, "transactionId");
  required(event.payloadHash, "payloadHash", HASH_PATTERN);
  if (
    !Number.isSafeInteger(event.amountFen)
    || event.amountFen < 1
    || !["payment", "refund"].includes(event.kind)
    || !["succeeded", "failed", "cancelled", "refunded"].includes(event.status)
    || (event.kind === "refund"
      && !REFUND_PATTERN.test(event.refundRequestNo ?? ""))
  ) {
    throw new CommerceValidationError("payment event is invalid");
  }
  return event;
}

async function readReservation(
  client: PoolClient,
  userId: string,
  requestKey: string,
  lock = false,
): Promise<ReservationRow | undefined> {
  const result = await client.query<ReservationRow>(
    `SELECT ${RESERVATION_COLUMNS}
     FROM public.commerce_generation_reservations r
     JOIN public.commerce_credit_lots l ON l.id = r.credit_lot_id
     WHERE r.user_id = $1 AND r.request_key = $2
     ${lock ? "FOR UPDATE OF r, l" : ""}`,
    [userId, requestKey],
  );
  return result.rows[0];
}

export class CommercePostgresDataSource implements CommerceDataSource {
  async createOrder(input: CreateCommerceOrderInput): Promise<CommerceOrder> {
    const externalUserId = required(input.externalUserId, "userId");
    const requestKey = required(
      input.requestKey,
      "Idempotency-Key",
      KEY_PATTERN,
    );
    const now = input.now ?? new Date();
    const orderNo = input.orderNo
      ? required(input.orderNo, "orderNo", ORDER_PATTERN)
      : commerceOrderNo(now);
    const product = input.product;

    return withPostgresTransaction(async (client) => {
      const user = await lockUser(client, externalUserId);
      await client.query(
        "SELECT pg_advisory_xact_lock(hashtextextended($1, 0))",
        [`memoryai:commerce-order:${user.id}:${requestKey}`],
      );
      const existing = await client.query<OrderRow>(
        `SELECT ${ORDER_COLUMNS} FROM public.commerce_orders o
         WHERE o.user_id = $1 AND o.request_key = $2 FOR UPDATE`,
        [user.id, requestKey],
      );
      if (existing.rows[0]) {
        const current = existing.rows[0];
        if (
          current.product_id !== product.id
          || current.platform !== input.platform
          || current.payment_rail !== input.paymentRail
        ) {
          throw new CommerceStateError("Idempotency-Key payload conflict");
        }
        return order(current);
      }

      const inserted = await client.query<OrderRow>(
        `INSERT INTO public.commerce_orders (
           user_id, order_no, request_key, product_id, platform, payment_rail,
           amount_fen, generation_credits, grants_first_preview_save
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         RETURNING ${ORDER_COLUMNS.replaceAll("o.", "")}`,
        [
          user.id,
          orderNo,
          requestKey,
          product.id,
          input.platform,
          input.paymentRail,
          product.priceFen,
          product.generationCredits,
          product.grantsFirstPreviewSave,
        ],
      );
      return order(inserted.rows[0]);
    });
  }

  async listOrders(externalUserId: string): Promise<CommerceOrder[]> {
    const result = await queryPostgres<OrderRow>(
      `SELECT ${ORDER_COLUMNS}
       FROM public.commerce_orders o
       JOIN public.users u ON u.id = o.user_id
       WHERE u.external_id = $1
       ORDER BY o.created_at DESC`,
      [required(externalUserId, "userId")],
    );
    return result.rows.map(order);
  }

  async applyPaymentEvent(
    rail: CommerceOrder["paymentRail"],
    input: CommercePaymentEvent,
  ): Promise<CommerceSettlement> {
    const event = assertEvent(input);
    return withPostgresTransaction(async (client) => {
      const found = await client.query<OrderRow>(
        `SELECT ${ORDER_COLUMNS} FROM public.commerce_orders o
         WHERE o.order_no = $1 FOR UPDATE`,
        [event.orderNo],
      );
      const current = found.rows[0];
      if (!current) throw new CommerceNotFoundError("Order was not found");
      if (
        current.payment_rail !== rail
        || current.amount_fen !== event.amountFen
      ) {
        throw new CommerceStateError("Payment event does not match order");
      }

      const written = await client.query(
        `INSERT INTO public.commerce_order_events (
           payment_rail, provider_event_id, order_id, event_kind, payload_hash
         ) VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (payment_rail, provider_event_id) DO NOTHING
         RETURNING id`,
        [rail, event.eventId, current.id, event.kind, event.payloadHash],
      );
      if (!written.rows[0]) {
        const duplicate = await client.query<{
          order_id: string;
          event_kind: string;
          payload_hash: string;
        }>(
          `SELECT order_id, event_kind, payload_hash
           FROM public.commerce_order_events
           WHERE payment_rail = $1 AND provider_event_id = $2`,
          [rail, event.eventId],
        );
        const same = duplicate.rows[0];
        if (
          !same
          || same.order_id !== current.id
          || same.event_kind !== event.kind
          || same.payload_hash !== event.payloadHash
        ) {
          throw new CommerceStateError("Payment event id conflict");
        }
        return { outcome: "duplicate", orderNo: current.order_no };
      }

      if (event.kind === "refund") {
        const request = await client.query<{ id: string; status: string }>(
          `SELECT id, status FROM public.commerce_refund_requests
           WHERE order_id = $1 AND request_no = $2 FOR UPDATE`,
          [current.id, event.refundRequestNo],
        );
        if (!request.rows[0]) {
          throw new CommerceStateError("Refund request was not found");
        }
        if (event.status !== "refunded") {
          return { outcome: "failed", orderNo: current.order_no };
        }
        if (
          current.status === "refunded"
          && request.rows[0].status === "succeeded"
        ) {
          return { outcome: "duplicate", orderNo: current.order_no };
        }
        if (
          current.status !== "paid"
          || current.provider_transaction_id !== event.transactionId
        ) {
          throw new CommerceStateError("Refund does not match paid order");
        }
        await client.query(
          `UPDATE public.commerce_orders
           SET status = 'refunded', refunded_at = NOW(), updated_at = NOW()
           WHERE id = $1`,
          [current.id],
        );
        await client.query(
          `UPDATE public.commerce_credit_lots
           SET active = false, updated_at = NOW()
           WHERE source_kind = 'paid_package' AND source_key = $1`,
          [current.id],
        );
        await client.query(
          `UPDATE public.commerce_refund_requests
           SET status = 'succeeded', resolved_at = NOW(), updated_at = NOW()
           WHERE id = $1`,
          [request.rows[0].id],
        );
        const replacementOrder = await client.query<{ id: string }>(
          `SELECT id FROM public.commerce_orders
           WHERE user_id = $1 AND status = 'paid' AND id <> $2
           ORDER BY paid_at ASC, id ASC LIMIT 1`,
          [current.user_id, current.id],
        );
        if (replacementOrder.rows[0]) {
          await client.query(
            `UPDATE public.commerce_save_rights
             SET source_order_id = $2, updated_at = NOW()
             WHERE user_id = $1 AND source_order_id = $3`,
            [current.user_id, replacementOrder.rows[0].id, current.id],
          );
        } else {
          await client.query(
            `DELETE FROM public.commerce_save_rights
             WHERE user_id = $1 AND source_order_id = $2`,
            [current.user_id, current.id],
          );
        }
        return { outcome: "refunded", orderNo: current.order_no };
      }

      if (event.status !== "succeeded") {
        const status =
          event.status === "cancelled" ? "cancelled" : "failed";
        if (current.status === "pending") {
          await client.query(
            `UPDATE public.commerce_orders
             SET status = $2, updated_at = NOW() WHERE id = $1`,
            [current.id, status],
          );
        }
        return { outcome: status, orderNo: current.order_no };
      }

      if (current.status === "paid" || current.status === "refunded") {
        if (current.provider_transaction_id !== event.transactionId) {
          throw new CommerceStateError("Transaction conflicts with order");
        }
        return { outcome: "duplicate", orderNo: current.order_no };
      }
      await client.query(
        `UPDATE public.commerce_orders
         SET status = 'paid', provider_transaction_id = $2,
             paid_at = NOW(), updated_at = NOW()
         WHERE id = $1`,
        [current.id, event.transactionId],
      );
      await client.query(
        `INSERT INTO public.commerce_credit_lots (
           user_id, source_kind, source_key, total_credits, save_allowed
         ) VALUES ($1, 'paid_package', $2, $3, true)
         ON CONFLICT (source_kind, source_key) DO NOTHING`,
        [current.user_id, current.id, current.generation_credits],
      );
      if (current.grants_first_preview_save) {
        const preview = await client.query<{ id: string }>(
          `SELECT r.id
           FROM public.commerce_generation_reservations r
           JOIN public.commerce_credit_lots l ON l.id = r.credit_lot_id
           WHERE r.user_id = $1
             AND l.source_kind = 'free_preview'
             AND r.status = 'consumed'
           ORDER BY r.settled_at ASC
           LIMIT 1`,
          [current.user_id],
        );
        await client.query(
          `INSERT INTO public.commerce_save_rights (
             user_id, source_order_id, reservation_id
           ) VALUES ($1, $2, $3)
           ON CONFLICT (user_id) DO NOTHING`,
          [current.user_id, current.id, preview.rows[0]?.id ?? null],
        );
      }
      return { outcome: "paid", orderNo: current.order_no };
    });
  }

  async requestRefund(input: {
    externalUserId: string;
    orderNo: string;
    requestKey: string;
    reason: CommerceRefundRequest["reason"];
  }): Promise<CommerceRefundRequest> {
    const externalUserId = required(input.externalUserId, "userId");
    const orderNo = required(input.orderNo, "orderNo", ORDER_PATTERN);
    const requestKey = required(input.requestKey, "requestKey", KEY_PATTERN);
    if (
      !["unused_purchase", "duplicate_charge", "service_failure"].includes(
        input.reason,
      )
    ) {
      throw new CommerceValidationError("refund reason is invalid");
    }

    return withPostgresTransaction(async (client) => {
      const user = await lockUser(client, externalUserId);
      const found = await client.query<OrderRow>(
        `SELECT ${ORDER_COLUMNS} FROM public.commerce_orders o
         WHERE o.user_id = $1 AND o.order_no = $2 FOR UPDATE`,
        [user.id, orderNo],
      );
      const current = found.rows[0];
      if (!current) throw new CommerceNotFoundError("Order was not found");
      await client.query(
        "SELECT pg_advisory_xact_lock(hashtextextended($1, 0))",
        [`memoryai:commerce-refund:${current.id}`],
      );
      const existing = await client.query<RefundRow>(
        `SELECT r.id, o.order_no, r.request_key, r.request_no, r.reason, r.status,
                r.created_at, r.resolved_at
         FROM public.commerce_refund_requests r
         JOIN public.commerce_orders o ON o.id = r.order_id
         WHERE r.order_id = $1 FOR UPDATE`,
        [current.id],
      );
      if (existing.rows[0]) {
        if (
          existing.rows[0].request_key !== requestKey
          || existing.rows[0].reason !== input.reason
        ) {
          throw new CommerceStateError("Idempotency-Key payload conflict");
        }
        return refund(existing.rows[0]);
      }
      if (current.status !== "paid") {
        throw new CommerceStateError("Order is not refundable");
      }
      const inserted = await client.query<RefundRow>(
        `WITH written AS (
           INSERT INTO public.commerce_refund_requests (
             user_id, order_id, request_key, request_no, reason
           ) VALUES ($1, $2, $3, $4, $5)
           RETURNING *
         )
         SELECT written.id, o.order_no, written.request_key,
                written.request_no, written.reason, written.status,
                written.created_at, written.resolved_at
         FROM written JOIN public.commerce_orders o ON o.id = written.order_id`,
        [
          user.id,
          current.id,
          requestKey,
          commerceRefundNo(new Date()),
          input.reason,
        ],
      );
      return refund(inserted.rows[0]);
    });
  }

  async getCreditBalance(externalUserId: string): Promise<CreditBalance> {
    const result = await queryPostgres<{
      source_kind: CreditSourceKind;
      available: string;
    }>(
      `SELECT l.source_kind,
              SUM(l.total_credits - l.reserved_credits - l.consumed_credits)::text AS available
       FROM public.commerce_credit_lots l
       JOIN public.users u ON u.id = l.user_id
       WHERE u.external_id = $1 AND l.active
       GROUP BY l.source_kind`,
      [required(externalUserId, "userId")],
    );
    const available = new Map(
      result.rows.map((row) => [row.source_kind, Number(row.available)]),
    );
    const save = await queryPostgres(
      `SELECT s.user_id FROM public.commerce_save_rights s
       JOIN public.users u ON u.id = s.user_id
       WHERE u.external_id = $1 LIMIT 1`,
      [externalUserId],
    );
    const paidAvailable = available.get("paid_package") ?? 0;
    const referralAvailable = available.get("referral_reward") ?? 0;
    const freePreviewAvailable = available.get("free_preview") ?? 0;
    const photoRemedyAvailable = available.get("photo_remedy") ?? 0;
    return {
      paidAvailable,
      referralAvailable,
      freePreviewAvailable,
      photoRemedyAvailable,
      totalAvailable:
        paidAvailable
        + referralAvailable
        + freePreviewAvailable
        + photoRemedyAvailable,
      paidCreditsNeverExpire: true,
      canSaveFirstPreview: Boolean(save.rows[0]),
    };
  }

  async reserveGeneration(input: {
    externalUserId: string;
    memoryId: string;
    requestKey: string;
    generationKey: string;
    purpose: GenerationPurpose;
  }): Promise<GenerationReservation> {
    const externalUserId = required(input.externalUserId, "userId");
    const memoryId = required(input.memoryId, "memoryId", UUID_PATTERN);
    const requestKey = required(input.requestKey, "requestKey", KEY_PATTERN);
    const generationKey = required(
      input.generationKey,
      "generationKey",
      KEY_PATTERN,
    );
    const sourceByPurpose: Record<GenerationPurpose, CreditSourceKind> = {
      first_preview: "free_preview",
      new_video: "paid_package",
      photo_remedy: "photo_remedy",
      referral_experience: "referral_reward",
    };
    const sourceKind = sourceByPurpose[input.purpose];
    if (!sourceKind) throw new CommerceValidationError("purpose is invalid");

    return withPostgresTransaction(async (client) => {
      const user = await lockUser(client, externalUserId);
      await lockOwnedMemory(client, user.id, memoryId);
      await client.query(
        "SELECT pg_advisory_xact_lock(hashtextextended($1, 0))",
        [`memoryai:commerce-generation:${user.id}:${requestKey}`],
      );
      const existing = await readReservation(
        client,
        user.id,
        requestKey,
        true,
      );
      if (existing) {
        if (
          existing.memory_id !== memoryId
          || existing.generation_key !== generationKey
          || existing.purpose !== input.purpose
        ) {
          throw new CommerceStateError("Idempotency-Key payload conflict");
        }
        return reservation(existing);
      }

      if (input.purpose === "first_preview") {
        const first = await client.query<{ id: string }>(
          `SELECT id FROM public.memories
           WHERE user_id = $1 ORDER BY created_at ASC, id ASC LIMIT 1`,
          [user.id],
        );
        if (first.rows[0]?.id !== memoryId) {
          throw new CommerceStateError(
            "FREE_PREVIEW_ONLY_AVAILABLE_FOR_FIRST_MEMORY",
          );
        }
        await client.query(
          `INSERT INTO public.commerce_credit_lots (
             user_id, source_kind, source_key, total_credits, save_allowed
           ) VALUES ($1, 'free_preview', $2, 1, false)
           ON CONFLICT (source_kind, source_key) DO NOTHING`,
          [user.id, user.id],
        );
      }

      const selected = await client.query<{
        id: string;
        save_allowed: boolean;
      }>(
        `SELECT id, save_allowed
         FROM public.commerce_credit_lots
         WHERE user_id = $1
           AND source_kind = $2
           AND active
           AND total_credits > reserved_credits + consumed_credits
         ORDER BY created_at ASC, id ASC
         LIMIT 1 FOR UPDATE`,
        [user.id, sourceKind],
      );
      const lot = selected.rows[0];
      if (!lot) throw new CommerceStateError("GENERATION_CREDIT_UNAVAILABLE");
      await client.query(
        `UPDATE public.commerce_credit_lots
         SET reserved_credits = reserved_credits + 1, updated_at = NOW()
         WHERE id = $1`,
        [lot.id],
      );
      const inserted = await client.query<ReservationRow>(
        `WITH written AS (
           INSERT INTO public.commerce_generation_reservations (
             user_id, memory_id, credit_lot_id, request_key, generation_key,
             purpose
           ) VALUES ($1, $2, $3, $4, $5, $6)
           RETURNING *
         )
         SELECT written.id, written.memory_id, written.request_key,
                written.generation_key, written.purpose, l.source_kind,
                l.save_allowed, written.status, written.outcome,
                written.created_at, written.settled_at,
                written.credit_lot_id, written.user_id
         FROM written
         JOIN public.commerce_credit_lots l ON l.id = written.credit_lot_id`,
        [
          user.id,
          memoryId,
          lot.id,
          requestKey,
          generationKey,
          input.purpose,
        ],
      );
      return reservation(inserted.rows[0]);
    });
  }

  async settleGeneration(input: {
    externalUserId: string;
    requestKey: string;
    outcome: GenerationSettlementOutcome;
  }): Promise<GenerationReservation> {
    const externalUserId = required(input.externalUserId, "userId");
    const requestKey = required(input.requestKey, "requestKey", KEY_PATTERN);
    if (
      !["succeeded", "system_failed", "invalidated"].includes(input.outcome)
    ) {
      throw new CommerceValidationError("outcome is invalid");
    }
    return withPostgresTransaction(async (client) => {
      const user = await lockUser(client, externalUserId);
      await client.query(
        "SELECT pg_advisory_xact_lock(hashtextextended($1, 0))",
        [`memoryai:commerce-generation:${user.id}:${requestKey}`],
      );
      const current = await readReservation(
        client,
        user.id,
        requestKey,
        true,
      );
      if (!current) {
        throw new CommerceNotFoundError("Generation reservation was not found");
      }
      if (current.status !== "reserved") {
        if (current.outcome === input.outcome) return reservation(current);
        throw new CommerceStateError("Generation already settled");
      }

      const consumed = input.outcome === "succeeded";
      await client.query(
        `UPDATE public.commerce_credit_lots
         SET reserved_credits = reserved_credits - 1,
             consumed_credits = consumed_credits + $2,
             updated_at = NOW()
         WHERE id = $1 AND reserved_credits > 0`,
        [current.credit_lot_id, consumed ? 1 : 0],
      );
      const updated = await client.query<ReservationRow>(
        `UPDATE public.commerce_generation_reservations r
         SET status = $2, outcome = $3, settled_at = NOW(), updated_at = NOW()
         FROM public.commerce_credit_lots l
         WHERE r.id = $1 AND r.credit_lot_id = l.id AND r.status = 'reserved'
         RETURNING ${RESERVATION_COLUMNS}`,
        [
          current.id,
          consumed ? "consumed" : "released",
          input.outcome,
        ],
      );
      if (!updated.rows[0]) {
        throw new CommerceStateError("Generation settlement lost its lock");
      }
      if (consumed && current.purpose === "first_preview") {
        await client.query(
          `UPDATE public.commerce_save_rights
           SET reservation_id = $2, updated_at = NOW()
           WHERE user_id = $1 AND reservation_id IS NULL`,
          [user.id, current.id],
        );
      }
      return reservation(updated.rows[0]);
    });
  }

  async recoverGeneration(
    externalUserId: string,
    requestKey: string,
  ): Promise<GenerationReservation | null> {
    const result = await queryPostgres<ReservationRow>(
      `SELECT ${RESERVATION_COLUMNS}
       FROM public.commerce_generation_reservations r
       JOIN public.commerce_credit_lots l ON l.id = r.credit_lot_id
       JOIN public.users u ON u.id = r.user_id
       WHERE u.external_id = $1 AND r.request_key = $2`,
      [
        required(externalUserId, "userId"),
        required(requestKey, "requestKey", KEY_PATTERN),
      ],
    );
    return result.rows[0] ? reservation(result.rows[0]) : null;
  }

  async requestPhotoRemedy(
    input: PhotoRemedyInput,
  ): Promise<PhotoRemedyGrant> {
    const externalUserId = required(input.externalUserId, "userId");
    const memoryId = required(input.memoryId, "memoryId", UUID_PATTERN);
    const requestKey = required(input.requestKey, "requestKey", KEY_PATTERN);
    const originalGenerationKey = required(
      input.originalGenerationKey,
      "originalGenerationKey",
      KEY_PATTERN,
    );
    const photoDigest = required(
      input.replacementPhotoDigest,
      "replacementPhotoDigest",
      HASH_PATTERN,
    );
    return withPostgresTransaction(async (client) => {
      const user = await lockUser(client, externalUserId);
      await lockOwnedMemory(client, user.id, memoryId);
      await client.query(
        "SELECT pg_advisory_xact_lock(hashtextextended($1, 0))",
        [`memoryai:commerce-photo-remedy:${user.id}:${memoryId}`],
      );
      const existing = await client.query<{
        request_key: string;
        original_generation_key: string;
        replacement_photo_digest: string;
      }>(
        `SELECT request_key, original_generation_key, replacement_photo_digest
         FROM public.commerce_photo_remedies
         WHERE user_id = $1 AND memory_id = $2 FOR UPDATE`,
        [user.id, memoryId],
      );
      if (existing.rows[0]) {
        const row = existing.rows[0];
        if (
          row.request_key !== requestKey
          || row.original_generation_key !== originalGenerationKey
          || row.replacement_photo_digest !== photoDigest
        ) {
          throw new CommerceStateError("Photo remedy was already used");
        }
        return { memoryId, granted: true, saveAllowed: false };
      }
      const original = await client.query(
        `SELECT r.id
         FROM public.commerce_generation_reservations r
         JOIN public.commerce_credit_lots l ON l.id = r.credit_lot_id
         WHERE r.user_id = $1 AND r.memory_id = $2
           AND r.generation_key = $3
           AND r.purpose = 'first_preview'
           AND r.status = 'consumed'
           AND l.source_kind = 'free_preview'
         FOR KEY SHARE`,
        [user.id, memoryId, originalGenerationKey],
      );
      if (!original.rows[0]) {
        throw new CommerceStateError("Successful free preview is required");
      }
      const lot = await client.query<{ id: string }>(
        `INSERT INTO public.commerce_credit_lots (
           user_id, source_kind, source_key, total_credits, save_allowed
         ) VALUES ($1, 'photo_remedy', $2, 1, false)
         RETURNING id`,
        [user.id, memoryId],
      );
      await client.query(
        `INSERT INTO public.commerce_photo_remedies (
           user_id, memory_id, credit_lot_id, request_key,
           original_generation_key, replacement_photo_digest
         ) VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          user.id,
          memoryId,
          lot.rows[0].id,
          requestKey,
          originalGenerationKey,
          photoDigest,
        ],
      );
      return { memoryId, granted: true, saveAllowed: false };
    });
  }

  async canSaveGeneration(
    externalUserId: string,
    generationKey: string,
  ): Promise<boolean> {
    const result = await queryPostgres(
      `SELECT s.user_id
       FROM public.commerce_save_rights s
       JOIN public.users u ON u.id = s.user_id
       JOIN public.commerce_generation_reservations r
         ON r.id = s.reservation_id
       WHERE u.external_id = $1 AND r.generation_key = $2
       LIMIT 1`,
      [
        required(externalUserId, "userId"),
        required(generationKey, "generationKey", KEY_PATTERN),
      ],
    );
    return Boolean(result.rows[0]);
  }

  async createReferralCode(input: {
    externalUserId: string;
    requestKey: string;
    code?: string;
  }): Promise<ReferralCode> {
    const externalUserId = required(input.externalUserId, "userId");
    const requestKey = required(input.requestKey, "requestKey", KEY_PATTERN);
    const code = required(input.code ?? "", "code", CODE_PATTERN);
    return withPostgresTransaction(async (client) => {
      const user = await lockUser(client, externalUserId);
      await client.query(
        "SELECT pg_advisory_xact_lock(hashtextextended($1, 0))",
        [`memoryai:commerce-referral-code:${user.id}`],
      );
      const existing = await client.query<{
        code: string;
        created_at: Date | string;
      }>(
        `SELECT code, created_at FROM public.commerce_referral_codes
         WHERE inviter_user_id = $1 FOR UPDATE`,
        [user.id],
      );
      if (existing.rows[0]) {
        return {
          code: existing.rows[0].code,
          createdAt: iso(existing.rows[0].created_at)!,
        };
      }
      const inserted = await client.query<{
        code: string;
        created_at: Date | string;
      }>(
        `INSERT INTO public.commerce_referral_codes (
           inviter_user_id, request_key, code
         ) VALUES ($1, $2, $3)
         RETURNING code, created_at`,
        [user.id, requestKey, code],
      );
      return {
        code: inserted.rows[0].code,
        createdAt: iso(inserted.rows[0].created_at)!,
      };
    });
  }

  async qualifyReferral(input: {
    inviteeExternalUserId: string;
    requestKey: string;
    code: string;
    deviceKeyHash: string;
  }): Promise<ReferralQualification> {
    const inviteeExternalUserId = required(
      input.inviteeExternalUserId,
      "userId",
      /^phone:[0-9a-f]{64}$/,
    );
    const phoneHash = inviteeExternalUserId.slice("phone:".length);
    const requestKey = required(input.requestKey, "requestKey", KEY_PATTERN);
    const code = required(input.code, "code", CODE_PATTERN);
    const deviceKeyHash = required(
      input.deviceKeyHash,
      "deviceKeyHash",
      HASH_PATTERN,
    );

    return withPostgresTransaction(async (client) => {
      const invitee = await lockUser(client, inviteeExternalUserId);
      const codeResult = await client.query<{
        inviter_user_id: string;
        inviter_external_id: string;
      }>(
        `SELECT c.inviter_user_id, u.external_id AS inviter_external_id
         FROM public.commerce_referral_codes c
         JOIN public.users u ON u.id = c.inviter_user_id
         WHERE c.code = $1 FOR KEY SHARE OF c`,
        [code],
      );
      const referralCode = codeResult.rows[0];
      if (!referralCode) {
        throw new CommerceNotFoundError("Referral code was not found");
      }
      if (referralCode.inviter_user_id === invitee.id) {
        throw new CommerceStateError("Self-referral is not allowed");
      }
      const createdAt = new Date(invitee.created_at).getTime();
      if (Date.now() - createdAt > 60 * 60 * 1000) {
        throw new CommerceStateError("Referral requires a new user");
      }

      await client.query(
        "SELECT pg_advisory_xact_lock(hashtextextended($1, 0))",
        [`memoryai:commerce-referral:${referralCode.inviter_user_id}`],
      );
      await client.query(
        "SELECT pg_advisory_xact_lock(hashtextextended($1, 1))",
        [`memoryai:commerce-referral-device:${deviceKeyHash}`],
      );
      const duplicate = await client.query<
        ReferralQualificationRow & {
          request_key: string;
          phone_hash: string;
          device_key_hash: string;
        }
      >(
        `SELECT inviter.external_id AS inviter_external_id,
                invitee.external_id AS invitee_external_id,
                q.reward_cohort, q.request_key, q.phone_hash,
                q.device_key_hash
         FROM public.commerce_referral_qualifications q
         JOIN public.users inviter ON inviter.id = q.inviter_user_id
         JOIN public.users invitee ON invitee.id = q.invitee_user_id
         WHERE q.invitee_user_id = $1
            OR q.phone_hash = $2
            OR q.device_key_hash = $3
            OR (q.invitee_user_id = $1 AND q.request_key = $4)
         FOR UPDATE OF q`,
        [invitee.id, phoneHash, deviceKeyHash, requestKey],
      );
      if (duplicate.rows[0]) {
        const same = duplicate.rows[0];
        if (
          same.inviter_external_id !== referralCode.inviter_external_id
          || same.invitee_external_id !== inviteeExternalUserId
          || same.request_key !== requestKey
          || same.phone_hash !== phoneHash
          || same.device_key_hash !== deviceKeyHash
        ) {
          throw new CommerceStateError(
            "Referral phone or device was already used",
          );
        }
        const count = await this.qualifiedCount(
          client,
          referralCode.inviter_user_id,
        );
        return {
          inviterExternalUserId: same.inviter_external_id,
          inviteeExternalUserId: same.invitee_external_id,
          qualifiedCount: count,
          rewardGranted: same.reward_cohort !== null,
          rewardCohort: same.reward_cohort,
        };
      }

      const inserted = await client.query<{ id: string }>(
        `INSERT INTO public.commerce_referral_qualifications (
           inviter_user_id, invitee_user_id, request_key,
           phone_hash, device_key_hash
         ) VALUES ($1, $2, $3, $4, $5)
         RETURNING id`,
        [
          referralCode.inviter_user_id,
          invitee.id,
          requestKey,
          phoneHash,
          deviceKeyHash,
        ],
      );
      const count = await this.qualifiedCount(
        client,
        referralCode.inviter_user_id,
      );
      let rewardCohort: number | null = null;
      if (count % 3 === 0) {
        rewardCohort = count / 3;
        const reward = await client.query<{ id: string }>(
          `INSERT INTO public.commerce_referral_rewards (
             inviter_user_id, cohort
           ) VALUES ($1, $2)
           ON CONFLICT (inviter_user_id, cohort) DO NOTHING
           RETURNING id`,
          [referralCode.inviter_user_id, rewardCohort],
        );
        if (reward.rows[0]) {
          await client.query(
            `INSERT INTO public.commerce_credit_lots (
               user_id, source_kind, source_key, total_credits, save_allowed
             ) VALUES ($1, 'referral_reward', $2, 1, false)
             ON CONFLICT (source_kind, source_key) DO NOTHING`,
            [
              referralCode.inviter_user_id,
              `${referralCode.inviter_user_id}:${rewardCohort}`,
            ],
          );
          await client.query(
            `UPDATE public.commerce_referral_qualifications
             SET reward_cohort = $2, updated_at = NOW()
             WHERE id = $1`,
            [inserted.rows[0].id, rewardCohort],
          );
        } else {
          rewardCohort = null;
        }
      }
      return {
        inviterExternalUserId: referralCode.inviter_external_id,
        inviteeExternalUserId,
        qualifiedCount: count,
        rewardGranted: rewardCohort !== null,
        rewardCohort,
      };
    });
  }

  private async qualifiedCount(
    client: PoolClient,
    inviterUserId: string,
  ): Promise<number> {
    const result = await client.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count
       FROM public.commerce_referral_qualifications
       WHERE inviter_user_id = $1`,
      [inviterUserId],
    );
    return Number(result.rows[0]?.count ?? 0);
  }

  async getReferralStatus(externalUserId: string): Promise<ReferralStatus> {
    const result = await queryPostgres<{
      code: string;
      qualified: string;
      rewards: string;
    }>(
      `SELECT c.code,
              COUNT(DISTINCT q.id)::text AS qualified,
              COUNT(DISTINCT r.id)::text AS rewards
       FROM public.commerce_referral_codes c
       JOIN public.users u ON u.id = c.inviter_user_id
       LEFT JOIN public.commerce_referral_qualifications q
         ON q.inviter_user_id = c.inviter_user_id
       LEFT JOIN public.commerce_referral_rewards r
         ON r.inviter_user_id = c.inviter_user_id
       WHERE u.external_id = $1
       GROUP BY c.code`,
      [required(externalUserId, "userId")],
    );
    if (!result.rows[0]) {
      throw new CommerceNotFoundError("Referral code was not found");
    }
    const qualified = Number(result.rows[0].qualified);
    const remainder = qualified % 3;
    return {
      code: result.rows[0].code,
      qualifiedInvitees: qualified,
      rewardsGranted: Number(result.rows[0].rewards),
      inviteesUntilNextReward: remainder === 0 ? 3 : 3 - remainder,
    };
  }

  async reconcileOrders(now: Date = new Date()): Promise<ReconciliationReport> {
    const result = await queryPostgres<{
      order_no: string;
      status: CommerceOrder["status"];
      generation_credits: number;
      lot_total: number | null;
      lot_active: boolean | null;
      save_right_exists: boolean;
      save_right_from_this_order: boolean;
    }>(
      `SELECT o.order_no, o.status, o.generation_credits,
              l.total_credits AS lot_total, l.active AS lot_active,
              EXISTS (
                SELECT 1 FROM public.commerce_save_rights s
                WHERE s.user_id = o.user_id
              ) AS save_right_exists,
              EXISTS (
                SELECT 1 FROM public.commerce_save_rights s
                WHERE s.user_id = o.user_id
                  AND s.source_order_id = o.id
              ) AS save_right_from_this_order
       FROM public.commerce_orders o
       LEFT JOIN public.commerce_credit_lots l
         ON l.source_kind = 'paid_package' AND l.source_key = o.id::text
       ORDER BY o.created_at ASC`,
    );
    const issues: ReconciliationIssue[] = [];
    for (const row of result.rows) {
      if (row.status === "paid" && row.lot_total === null) {
        issues.push({
          code: "PAID_ORDER_CREDIT_LOT_MISSING",
          orderNo: row.order_no,
          detail: "Paid order has no credit lot",
        });
      } else if (
        row.status === "paid"
        && row.lot_total !== row.generation_credits
      ) {
        issues.push({
          code: "PAID_ORDER_CREDIT_MISMATCH",
          orderNo: row.order_no,
          detail: "Paid order credit quantity differs from its product snapshot",
        });
      }
      if (row.status === "paid" && !row.save_right_exists) {
        issues.push({
          code: "PAID_USER_SAVE_RIGHT_MISSING",
          orderNo: row.order_no,
          detail: "Paid user has no first-preview save right",
        });
      }
      if (row.status === "refunded" && row.lot_active) {
        issues.push({
          code: "REFUNDED_ORDER_CREDIT_STILL_ACTIVE",
          orderNo: row.order_no,
          detail: "Refunded order still exposes available paid credit",
        });
      }
      if (
        row.status === "refunded"
        && row.save_right_from_this_order
      ) {
        issues.push({
          code: "REFUNDED_ORDER_SAVE_RIGHT_STILL_ACTIVE",
          orderNo: row.order_no,
          detail: "Refunded order still owns the first-preview save right",
        });
      }
      if (
        row.status !== "paid"
        && row.status !== "refunded"
        && row.lot_active
      ) {
        issues.push({
          code: "UNSETTLED_ORDER_HAS_ACTIVE_CREDIT",
          orderNo: row.order_no,
          detail: "Unsettled order has an active paid credit lot",
        });
      }
    }
    return {
      checkedAt: now.toISOString(),
      ordersChecked: result.rows.length,
      issues,
    };
  }
}
