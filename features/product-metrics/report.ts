import { queryPostgres } from "@/src/server/database";

import { productMetricsEnvironment, type ProductMetricsEnvironment } from "./product-metrics";

export type ProductMetricsReportInput = { from: Date; to: Date; environment: ProductMetricsEnvironment };

type DailyRow = {
  day: string; source_channel: string; visitors: string; experience_starts: string; photo_uploads: string;
  memories_created: string; initial_video_requests: string; video_succeeded: string; video_playback_starts: string;
  video_played_3s: string; first_ai_replies: string; confirmed_pickups: string; payment_page_views: string;
  payment_started: string; first_payments: string; repurchases: string; gmv_minor: string; refunds_minor: string;
  failed_payments: string; entitlement_rows: string;
};
type CostRow = { basis: "actual" | "estimated"; cost_category: string; amount_minor: string; entries: string; mock_entries: string };
type RetentionRow = { day_offset: number; eligible_users: string; retained_users: string; incomplete_cohorts: string };
type CoverageRow = { metric_surface: string; coverage_started_at: Date | string };

function validRange(input: ProductMetricsReportInput): void {
  if (Number.isNaN(input.from.getTime()) || Number.isNaN(input.to.getTime()) || input.to <= input.from) {
    throw new Error("INVALID_TIME_RANGE");
  }
  if (input.to.getTime() - input.from.getTime() > 366 * 24 * 60 * 60 * 1000) throw new Error("INVALID_TIME_RANGE");
}

export async function buildProductMetricsReport(input: ProductMetricsReportInput): Promise<Record<string, unknown>> {
  validRange(input);
  if (productMetricsEnvironment() !== input.environment) throw new Error("METRICS_ENVIRONMENT_MISMATCH");
  const [daily, costs, retention, coverage, campaignSpend] = await Promise.all([
    queryPostgres<DailyRow>(
      `WITH flags AS (
         SELECT user_id FROM public.product_metrics_subject_flags WHERE environment=$3
       ),
       interactions AS (
         SELECT date_trunc('day', e.occurred_at)::date AS day,
                COALESCE(a.source, 'unattributed') AS source_channel,
                e.event_name,
                e.subject_key AS subject_id
           FROM public.product_interaction_events e
           LEFT JOIN public.product_first_touch_attributions a
             ON a.environment=e.environment AND a.owner_id=e.owner_id
          WHERE e.environment=$3 AND e.occurred_at >= $1 AND e.occurred_at < $2
            AND NOT e.is_synthetic
            AND (e.owner_id IS NULL OR NOT EXISTS (SELECT 1 FROM flags f WHERE f.user_id=e.owner_id))
       ),
       interaction_daily AS (
         SELECT day, source_channel,
           count(DISTINCT subject_id) FILTER (WHERE event_name='guest_experience_started')::text AS visitors,
           count(DISTINCT subject_id) FILTER (WHERE event_name='guest_experience_started')::text AS experience_starts,
           count(DISTINCT subject_id) FILTER (WHERE event_name='photo_upload_succeeded')::text AS photo_uploads,
           count(DISTINCT subject_id) FILTER (WHERE event_name='first_presence_video_played_3s')::text AS video_playback_starts,
           count(DISTINCT subject_id) FILTER (WHERE event_name='first_presence_video_played_3s')::text AS video_played_3s,
           count(DISTINCT subject_id) FILTER (WHERE event_name='paywall_viewed')::text AS payment_page_views,
           count(DISTINCT subject_id) FILTER (WHERE event_name='payment_button_clicked')::text AS payment_started
         FROM interactions GROUP BY day, source_channel
       ),
       domain_daily AS (
         SELECT facts.day, COALESCE(attribution.source, 'unattributed') AS source_channel,
           count(DISTINCT memory_owner) FILTER (WHERE fact='memory_created')::text AS memories_created,
           count(DISTINCT memory_owner) FILTER (WHERE fact='initial_video_requested')::text AS initial_video_requests,
           count(DISTINCT memory_owner) FILTER (WHERE fact='video_succeeded')::text AS video_succeeded,
           count(DISTINCT memory_owner) FILTER (WHERE fact='first_ai_reply')::text AS first_ai_replies,
           count(DISTINCT memory_owner) FILTER (WHERE fact='pickup_confirmed')::text AS confirmed_pickups,
           count(DISTINCT memory_owner) FILTER (WHERE fact='first_payment')::text AS first_payments,
           count(DISTINCT memory_owner) FILTER (WHERE fact='repurchase')::text AS repurchases,
           count(DISTINCT memory_owner) FILTER (WHERE fact='payment_failed')::text AS failed_payments,
           count(DISTINCT memory_owner) FILTER (WHERE fact='entitlement')::text AS entitlement_rows,
           COALESCE(sum(amount_minor) FILTER (WHERE fact='first_payment' OR fact='repurchase'),0)::text AS gmv_minor,
           COALESCE(sum(amount_minor) FILTER (WHERE fact='refund'),0)::text AS refunds_minor
         FROM (
           SELECT m.created_at::date day, m.user_id memory_owner, 'memory_created'::text fact, 0::bigint amount_minor
             FROM public.memories m WHERE m.created_at >= $1 AND m.created_at < $2 AND m.deleted_at IS NULL
               AND NOT EXISTS (SELECT 1 FROM flags f WHERE f.user_id=m.user_id)
           UNION ALL
           SELECT j.created_at::date, j.user_id, 'initial_video_requested', 0 FROM public.video_generation_jobs j
             WHERE j.created_at >= $1 AND j.created_at < $2 AND j.use_case='first_presence'
               AND NOT EXISTS (SELECT 1 FROM flags f WHERE f.user_id=j.user_id)
           UNION ALL
           SELECT j.updated_at::date, j.user_id, 'video_succeeded', 0 FROM public.video_generation_jobs j
             WHERE j.updated_at >= $1 AND j.updated_at < $2 AND j.status='succeeded'
               AND NOT EXISTS (SELECT 1 FROM flags f WHERE f.user_id=j.user_id)
           UNION ALL
           SELECT ranked.updated_at::date, ranked.user_id, 'first_ai_reply', 0
             FROM (SELECT t.*, row_number() OVER (PARTITION BY t.user_id ORDER BY t.updated_at,t.id) AS row_number
                     FROM public.memory_chat_turns t WHERE t.status='completed') ranked
             WHERE ranked.row_number=1 AND ranked.updated_at >= $1 AND ranked.updated_at < $2
               AND NOT EXISTS (SELECT 1 FROM flags f WHERE f.user_id=ranked.user_id)
           UNION ALL
           SELECT l.created_at::date, m.user_id, 'pickup_confirmed', 0
             FROM public.long_term_memories l JOIN public.memories m ON m.id=l.memory_id
             WHERE l.created_at >= $1 AND l.created_at < $2 AND l.metadata->>'sourceKind'='user_confirmed_pickup'
               AND NOT EXISTS (SELECT 1 FROM flags f WHERE f.user_id=m.user_id)
           UNION ALL
           SELECT ranked.paid_at::date, ranked.user_id,
                  CASE WHEN ranked.row_number=1 THEN 'first_payment' ELSE 'repurchase' END, ranked.amount_fen::bigint
             FROM (SELECT o.*, row_number() OVER (PARTITION BY o.user_id ORDER BY o.paid_at,o.id) AS row_number
                     FROM public.commerce_orders o WHERE o.status IN ('paid','refunded') AND o.paid_at IS NOT NULL) ranked
             WHERE ranked.paid_at >= $1 AND ranked.paid_at < $2
               AND NOT EXISTS (SELECT 1 FROM flags f WHERE f.user_id=ranked.user_id)
           UNION ALL
           SELECT o.refunded_at::date, o.user_id, 'refund', o.amount_fen::bigint FROM public.commerce_orders o
             WHERE o.status='refunded' AND o.refunded_at >= $1 AND o.refunded_at < $2
               AND NOT EXISTS (SELECT 1 FROM flags f WHERE f.user_id=o.user_id)
           UNION ALL
           SELECT o.failed_at::date, o.user_id, 'payment_failed', 0 FROM public.commerce_orders o
             WHERE o.status='failed' AND o.failed_at >= $1 AND o.failed_at < $2
               AND NOT EXISTS (SELECT 1 FROM flags f WHERE f.user_id=o.user_id)
           UNION ALL
           SELECT e.created_at::date, e.user_id, 'entitlement', 0 FROM public.memory_entitlements e
             WHERE e.created_at >= $1 AND e.created_at < $2
               AND e.status='active' AND NOT EXISTS (SELECT 1 FROM flags f WHERE f.user_id=e.user_id)
         ) facts
         LEFT JOIN public.product_first_touch_attributions attribution
           ON attribution.environment=$3 AND attribution.owner_id=facts.memory_owner
         GROUP BY facts.day, attribution.source
       )
       SELECT COALESCE(i.day,d.day)::text AS day, COALESCE(i.source_channel,d.source_channel) AS source_channel,
         COALESCE(i.visitors,'0') AS visitors, COALESCE(i.experience_starts,'0') AS experience_starts,
         COALESCE(i.photo_uploads,'0') AS photo_uploads, COALESCE(d.memories_created,'0') AS memories_created,
         COALESCE(d.initial_video_requests,'0') AS initial_video_requests, COALESCE(d.video_succeeded,'0') AS video_succeeded,
         COALESCE(i.video_playback_starts,'0') AS video_playback_starts, COALESCE(i.video_played_3s,'0') AS video_played_3s,
         COALESCE(d.first_ai_replies,'0') AS first_ai_replies, COALESCE(d.confirmed_pickups,'0') AS confirmed_pickups,
         COALESCE(i.payment_page_views,'0') AS payment_page_views, COALESCE(i.payment_started,'0') AS payment_started,
         COALESCE(d.first_payments,'0') AS first_payments, COALESCE(d.repurchases,'0') AS repurchases,
         COALESCE(d.gmv_minor,'0') AS gmv_minor, COALESCE(d.refunds_minor,'0') AS refunds_minor,
         COALESCE(d.failed_payments,'0') AS failed_payments, COALESCE(d.entitlement_rows,'0') AS entitlement_rows
       FROM interaction_daily i FULL OUTER JOIN domain_daily d ON d.day=i.day AND d.source_channel=i.source_channel
       ORDER BY day, source_channel`,
      [input.from, input.to, input.environment],
    ),
    queryPostgres<CostRow>(
      `SELECT basis, cost_category, COALESCE(sum(amount_minor),0)::text AS amount_minor,
              count(*)::text AS entries, count(*) FILTER (WHERE is_mock)::text AS mock_entries
         FROM public.cost_ledger_entries
        WHERE environment=$3 AND occurred_at >= $1 AND occurred_at < $2
        GROUP BY basis,cost_category ORDER BY basis,cost_category`,
      [input.from, input.to, input.environment],
    ),
    queryPostgres<RetentionRow>(
      `WITH flags AS (SELECT user_id FROM public.product_metrics_subject_flags WHERE environment=$3),
       activation AS (
         SELECT user_id, min(happened_at)::date AS activation_day FROM (
           SELECT owner_id AS user_id, occurred_at AS happened_at FROM public.product_interaction_events
            WHERE environment=$3 AND event_name='first_presence_video_played_3s' AND owner_id IS NOT NULL AND NOT is_synthetic
           UNION ALL SELECT user_id, updated_at FROM public.memory_chat_turns WHERE status='completed'
         ) values WHERE NOT EXISTS (SELECT 1 FROM flags f WHERE f.user_id=values.user_id) GROUP BY user_id
       ), active AS (
         SELECT DISTINCT user_id, happened_at::date AS active_day FROM (
           SELECT owner_id AS user_id, occurred_at AS happened_at FROM public.product_interaction_events
            WHERE environment=$3 AND event_name='first_presence_video_played_3s' AND owner_id IS NOT NULL AND NOT is_synthetic
           UNION ALL SELECT user_id, updated_at FROM public.memory_chat_turns WHERE status='completed'
           UNION ALL SELECT m.user_id, asset.created_at FROM public.media_assets asset JOIN public.memories m ON m.id=asset.memory_id
             WHERE asset.status='uploaded' AND asset.deleted_at IS NULL
           UNION ALL SELECT m.user_id, l.created_at FROM public.long_term_memories l JOIN public.memories m ON m.id=l.memory_id
             WHERE l.metadata->>'sourceKind'='user_confirmed_pickup'
         ) values WHERE NOT EXISTS (SELECT 1 FROM flags f WHERE f.user_id=values.user_id)
       ), offsets AS (SELECT unnest(ARRAY[1,7,30]) AS day_offset)
       SELECT offsets.day_offset,
              count(*) FILTER (WHERE activation.activation_day + offsets.day_offset <= ($2::timestamptz - INTERVAL '1 day')::date)::text AS eligible_users,
              count(DISTINCT activation.user_id) FILTER (WHERE active.active_day=activation.activation_day + offsets.day_offset AND activation.activation_day + offsets.day_offset <= ($2::timestamptz - INTERVAL '1 day')::date)::text AS retained_users,
              count(*) FILTER (WHERE activation.activation_day + offsets.day_offset > ($2::timestamptz - INTERVAL '1 day')::date)::text AS incomplete_cohorts
         FROM offsets CROSS JOIN activation LEFT JOIN active ON active.user_id=activation.user_id
        WHERE activation.activation_day >= $1::date AND activation.activation_day < $2::date
        GROUP BY offsets.day_offset ORDER BY offsets.day_offset`,
      [input.from, input.to, input.environment],
    ),
    queryPostgres<CoverageRow>(
      "SELECT metric_surface, coverage_started_at FROM public.product_metrics_coverage WHERE environment=$1 ORDER BY metric_surface",
      [input.environment],
    ),
    queryPostgres<{ spend_minor: string }>(
      `SELECT COALESCE(sum(spend_minor),0)::text AS spend_minor FROM public.campaign_spend_imports
       WHERE environment=$3 AND spend_date >= $1::date AND spend_date < $2::date`,
      [input.from, input.to, input.environment],
    ),
  ]);
  const firstPayments = daily.rows.reduce((sum, row) => sum + Number(row.first_payments), 0);
  const gmv = daily.rows.reduce((sum, row) => sum + Number(row.gmv_minor), 0);
  const refunds = daily.rows.reduce((sum, row) => sum + Number(row.refunds_minor), 0);
  const spend = Number(campaignSpend.rows[0]?.spend_minor ?? 0);
  return {
    generatedAt: new Date().toISOString(), environment: input.environment,
    range: { from: input.from.toISOString(), toExclusive: input.to.toISOString() },
    daily: daily.rows,
    retention: retention.rows.map((row) => ({ ...row, retentionRate: Number(row.eligible_users) === 0 ? null : Number(row.retained_users) / Number(row.eligible_users) })),
    costs: costs.rows,
    finance: {
      grossGmvMinor: gmv, refundsMinor: refunds, netReceivedMinor: gmv - refunds,
      arppuMinor: firstPayments === 0 ? null : gmv / firstPayments,
      campaignSpendMinor: spend || null,
      cacMinor: spend && firstPayments ? spend / firstPayments : null,
    },
    coverage: coverage.rows,
    knownLimits: [
      "Initial-video actual playback and payment-page exposure begin only at their recorded first-party coverage start.",
      "Video success time uses the durable job updated_at because historical jobs have no terminal_at column.",
      "CAC and payback remain unavailable until attributed spend and complete provider/payment cost ledger entries exist.",
    ],
  };
}

export function productMetricsCsv(report: Record<string, unknown>): string {
  const daily = Array.isArray(report.daily) ? report.daily as Record<string, unknown>[] : [];
  const fields = ["day", "source_channel", "visitors", "experience_starts", "photo_uploads", "memories_created", "initial_video_requests", "video_succeeded", "video_playback_starts", "video_played_3s", "first_ai_replies", "confirmed_pickups", "payment_page_views", "payment_started", "first_payments", "repurchases", "gmv_minor", "refunds_minor", "failed_payments", "entitlement_rows"];
  return [fields.join(","), ...daily.map((row) => fields.map((field) => JSON.stringify(row[field] ?? "")).join(","))].join("\n");
}
