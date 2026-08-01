import { queryPostgres, withPostgresTransaction } from "@/src/server/database";

import { BUSINESS_FUNNEL_STEPS, type BusinessFunnelReport, type ClientViewEvent } from "./types";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export const BUSINESS_METRICS_MINIMUM_COHORT_SIZE = 5;

function validDate(value: Date): Date {
  if (Number.isNaN(value.getTime())) throw new Error("INVALID_TIME_RANGE");
  return value;
}

function validMemoryId(value: string): string {
  if (!UUID_PATTERN.test(value)) throw new Error("INVALID_MEMORY_ID");
  return value;
}

export function aggregateFunnelReport(input: {
  from: Date;
  to: Date;
  counts: ReadonlyMap<string, number>;
}): BusinessFunnelReport {
  const loginCount = input.counts.get("login_completed") ?? 0;
  const visibleLoginCount = loginCount === 0 || loginCount >= BUSINESS_METRICS_MINIMUM_COHORT_SIZE
    ? loginCount
    : null;
  let previous: number | null = null;
  return {
    from: input.from.toISOString(),
    to: input.to.toISOString(),
    minimumCohortSize: BUSINESS_METRICS_MINIMUM_COHORT_SIZE,
    steps: BUSINESS_FUNNEL_STEPS.map((event) => {
      const rawUsers = input.counts.get(event) ?? 0;
      const suppressed = rawUsers > 0 && rawUsers < BUSINESS_METRICS_MINIMUM_COHORT_SIZE;
      const users = suppressed ? null : rawUsers;
      const conversionFromPrevious = previous === null || previous === 0 || users === null ? null : users / previous;
      const conversionFromLogin = visibleLoginCount === null || visibleLoginCount === 0 || users === null ? null : users / visibleLoginCount;
      previous = users;
      return { event, users, suppressed, conversionFromPrevious, conversionFromLogin };
    }),
  };
}

export class BusinessMetricsPostgresDataSource {
  async recordViewedEvent(input: { externalUserId: string; memoryId: string; event: ClientViewEvent }): Promise<boolean> {
    const memoryId = validMemoryId(input.memoryId);
    return withPostgresTransaction(async (client) => {
      const owner = await client.query<{ user_id: string }>(
        `SELECT m.user_id FROM public.memories m
         JOIN public.users u ON u.id = m.user_id
         WHERE m.id = $1 AND u.external_id = $2 FOR KEY SHARE OF m`,
        [memoryId, input.externalUserId],
      );
      if (!owner.rows[0]) throw new Error("MEMORY_NOT_FOUND");
      const written = await client.query(
        `INSERT INTO public.business_funnel_events (user_id, memory_id, event_type, event_key)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (event_type, event_key) DO NOTHING
         RETURNING id`,
        [owner.rows[0].user_id, memoryId, input.event, `${input.event}:${memoryId}`],
      );
      return written.rowCount === 1;
    });
  }

  async funnelReport(from: Date, to: Date): Promise<BusinessFunnelReport> {
    const start = validDate(from);
    const end = validDate(to);
    if (end <= start || end.getTime() - start.getTime() > 93 * 24 * 60 * 60 * 1000) throw new Error("INVALID_TIME_RANGE");
    const result = await queryPostgres<{ event_type: string; users: string }>(
      `SELECT event_type, count(DISTINCT user_id)::text AS users
       FROM public.business_funnel_events
       WHERE occurred_at >= $1 AND occurred_at < $2
       GROUP BY event_type`,
      [start, end],
    );
    const counts = new Map(result.rows.map((row) => [row.event_type, Number(row.users)]));
    return aggregateFunnelReport({ from: start, to: end, counts });
  }
}
