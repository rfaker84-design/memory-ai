import { queryPostgres, withPostgresTransaction } from "@/src/server/database";

export type DailyChatAdmission =
  | { status: "admitted"; remaining: number }
  | { status: "limit_reached" };

export type DailyChatAdmissionInput = {
  externalUserId: string;
  memoryId: string;
  idempotencyKey: string;
};

type DailyLimitEnvironment = {
  MEMORYAI_FREE_CHAT_DAILY_LIMIT?: string;
};

/** A launch guardrail for free chat, independent of paid entitlements. */
export const MAX_FREE_CHAT_DAILY_LIMIT = 200;

export class FreeChatAdmissionConfigurationError extends Error {
  constructor(public readonly code: "FREE_CHAT_DAILY_LIMIT_NOT_CONFIGURED" | "FREE_CHAT_DAILY_LIMIT_INVALID") {
    super(code);
  }
}

export function configuredDailyLimit(environment?: DailyLimitEnvironment): number {
  const raw = environment?.MEMORYAI_FREE_CHAT_DAILY_LIMIT ?? process.env.MEMORYAI_FREE_CHAT_DAILY_LIMIT;
  if (!raw) throw new FreeChatAdmissionConfigurationError("FREE_CHAT_DAILY_LIMIT_NOT_CONFIGURED");
  if (!/^[1-9][0-9]{0,2}$/.test(raw)) {
    throw new FreeChatAdmissionConfigurationError("FREE_CHAT_DAILY_LIMIT_INVALID");
  }
  const limit = Number(raw);
  if (limit > MAX_FREE_CHAT_DAILY_LIMIT) {
    throw new FreeChatAdmissionConfigurationError("FREE_CHAT_DAILY_LIMIT_INVALID");
  }
  return limit;
}

/**
 * Durable China-calendar-day admission for ordinary free chat. It deliberately
 * contains no message content and is separate from Commerce entitlement lots.
 * A short-lived reservation is counted before Provider work; a completed turn
 * commits it and any failed turn releases it. Stale reservations are reclaimed
 * under the same owner/day advisory lock after their bounded expiry.
 */
export class FreeChatDailyAdmissionService {
  constructor(private readonly limit = configuredDailyLimit()) {}

  async reserve(input: DailyChatAdmissionInput): Promise<DailyChatAdmission> {
    return withPostgresTransaction(async (client) => {
      const owner = await client.query<{ id: string }>(
        "SELECT id FROM public.users WHERE external_id = $1 FOR KEY SHARE",
        [input.externalUserId],
      );
      const userId = owner.rows[0]?.id;
      if (!userId) return { status: "limit_reached" };

      const day = await client.query<{ china_day: string }>(
        "SELECT (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Shanghai')::date::text AS china_day",
      );
      const chinaDay = day.rows[0]!.china_day;
      await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [
        `memoryai:free-chat-admission:${userId}:${chinaDay}`,
      ]);
      await client.query(
        `UPDATE public.free_chat_daily_admissions
         SET status = 'released', released_at = NOW(), updated_at = NOW()
         WHERE user_id = $1 AND china_day = $2::date AND status = 'reserved' AND reservation_expires_at <= NOW()`,
        [userId, chinaDay],
      );

      const existing = await client.query<{ status: "reserved" | "committed" | "released" }>(
        `SELECT status FROM public.free_chat_daily_admissions
         WHERE user_id = $1 AND memory_id = $2::uuid AND idempotency_key = $3 FOR UPDATE`,
        [userId, input.memoryId, input.idempotencyKey],
      );
      if (existing.rows[0]?.status === "reserved" || existing.rows[0]?.status === "committed") {
        return { status: "admitted", remaining: 0 };
      }

      const active = await client.query<{ count: string }>(
        `SELECT count(*)::text FROM public.free_chat_daily_admissions
         WHERE user_id = $1 AND china_day = $2::date AND status IN ('reserved', 'committed')`,
        [userId, chinaDay],
      );
      const activeCount = Number(active.rows[0]?.count ?? "0");
      if (activeCount >= this.limit) return { status: "limit_reached" };

      if (existing.rows[0]) {
        await client.query(
          `UPDATE public.free_chat_daily_admissions
           SET china_day = $3::date, status = 'reserved', reservation_expires_at = NOW() + INTERVAL '15 minutes',
               committed_at = NULL, released_at = NULL, updated_at = NOW()
           WHERE user_id = $1 AND memory_id = $2::uuid AND idempotency_key = $4`,
          [userId, input.memoryId, chinaDay, input.idempotencyKey],
        );
      } else {
        await client.query(
          `INSERT INTO public.free_chat_daily_admissions
             (user_id, memory_id, idempotency_key, china_day, reservation_expires_at)
           VALUES ($1, $2::uuid, $3, $4::date, NOW() + INTERVAL '15 minutes')`,
          [userId, input.memoryId, input.idempotencyKey, chinaDay],
        );
      }
      return { status: "admitted", remaining: this.limit - activeCount - 1 };
    });
  }

  async commit(input: DailyChatAdmissionInput): Promise<void> {
    await queryPostgres(
      `UPDATE public.free_chat_daily_admissions admission
       SET status = 'committed', committed_at = NOW(), reservation_expires_at = NULL, updated_at = NOW()
       FROM public.users user_record
       WHERE admission.user_id = user_record.id AND user_record.external_id = $1
         AND admission.memory_id = $2::uuid AND admission.idempotency_key = $3 AND admission.status = 'reserved'`,
      [input.externalUserId, input.memoryId, input.idempotencyKey],
    );
  }

  async release(input: DailyChatAdmissionInput): Promise<void> {
    await queryPostgres(
      `UPDATE public.free_chat_daily_admissions admission
       SET status = 'released', released_at = NOW(), updated_at = NOW()
       FROM public.users user_record
       WHERE admission.user_id = user_record.id AND user_record.external_id = $1
         AND admission.memory_id = $2::uuid AND admission.idempotency_key = $3 AND admission.status = 'reserved'`,
      [input.externalUserId, input.memoryId, input.idempotencyKey],
    );
  }
}
