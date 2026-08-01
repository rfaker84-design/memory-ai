import { queryPostgres } from "@/src/server/database";

export type OperationsSummary = {
  observedAt: string;
  video: {
    active: number;
    submissionUncertain: number;
    qualityPending: number;
    manualReview: number;
    terminalLast24Hours: number;
    terminalP95Seconds: number;
    committedCreditsLast24Hours: number;
  };
  media: {
    uploadsLast24Hours: number;
    uploadedBytesLast24Hours: number;
  };
  commerce: {
    pendingOrders: number;
    refundsAwaitingResolution: number;
  };
  accountDeletion: {
    runnableTasks: number;
    failedTasks: number;
  };
};

type SummaryRow = {
  video_active: string;
  video_submission_uncertain: string;
  video_quality_pending: string;
  video_manual_review: string;
  video_terminal_last_24_hours: string;
  video_terminal_p95_seconds: string;
  video_committed_credits_last_24_hours: string;
  media_uploads_last_24_hours: string;
  media_uploaded_bytes_last_24_hours: string;
  commerce_pending_orders: string;
  commerce_refunds_awaiting_resolution: string;
  deletion_runnable_tasks: string;
  deletion_failed_tasks: string;
};

function count(value: string): number {
  const parsed = Number.parseInt(value, 10);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : 0;
}

function nonnegativeNumber(value: string): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
}

/** Aggregate-only operational read model. It intentionally has no user, TA,
 * media object, provider task or payment identifier in its result. */
export class OperationsPostgresDataSource {
  async summary(now: Date = new Date()): Promise<OperationsSummary> {
    const result = await queryPostgres<SummaryRow>(
      `SELECT
        (SELECT count(*)::text FROM public.video_generation_jobs
          WHERE status IN ('queued','submitting','submitted','running','quality_pending')) AS video_active,
        (SELECT count(*)::text FROM public.video_generation_jobs
          WHERE status = 'submission_uncertain') AS video_submission_uncertain,
        (SELECT count(*)::text FROM public.video_generation_jobs
          WHERE status = 'quality_pending') AS video_quality_pending,
        (SELECT count(*)::text FROM public.video_generation_jobs
          WHERE status = 'manual_review_required') AS video_manual_review,
        (SELECT count(*)::text FROM public.video_generation_jobs
          WHERE status IN ('succeeded','rejected','failed') AND updated_at >= NOW() - INTERVAL '24 hours') AS video_terminal_last_24_hours,
        (SELECT COALESCE(percentile_cont(0.95) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM updated_at - created_at)), 0)::text
          FROM public.video_generation_jobs
          WHERE status IN ('succeeded','rejected','failed') AND updated_at >= NOW() - INTERVAL '24 hours') AS video_terminal_p95_seconds,
        (SELECT COALESCE(sum(actual_credits), 0)::text FROM public.video_generation_jobs
          WHERE entitlement_settlement='committed' AND updated_at >= NOW() - INTERVAL '24 hours') AS video_committed_credits_last_24_hours,
        (SELECT count(*)::text FROM public.media_assets
          WHERE status='uploaded' AND created_at >= NOW() - INTERVAL '24 hours') AS media_uploads_last_24_hours,
        (SELECT COALESCE(sum(size_bytes), 0)::text FROM public.media_assets
          WHERE status='uploaded' AND created_at >= NOW() - INTERVAL '24 hours') AS media_uploaded_bytes_last_24_hours,
        (SELECT count(*)::text FROM public.commerce_orders
          WHERE status = 'pending') AS commerce_pending_orders,
        (SELECT count(*)::text FROM public.commerce_refund_requests
          WHERE status IN ('manual_review','requested')) AS commerce_refunds_awaiting_resolution,
        (SELECT count(*)::text FROM public.account_deletion_tasks
          WHERE status IN ('pending','running','retry')) AS deletion_runnable_tasks,
        (SELECT count(*)::text FROM public.account_deletion_tasks
          WHERE status = 'failed') AS deletion_failed_tasks`,
      [],
      5_000,
    );
    const row = result.rows[0];
    if (!row) throw new Error("OPERATIONS_SUMMARY_UNAVAILABLE");
    return {
      observedAt: now.toISOString(),
      video: {
        active: count(row.video_active),
        submissionUncertain: count(row.video_submission_uncertain),
        qualityPending: count(row.video_quality_pending),
        manualReview: count(row.video_manual_review),
        terminalLast24Hours: count(row.video_terminal_last_24_hours),
        terminalP95Seconds: nonnegativeNumber(row.video_terminal_p95_seconds),
        committedCreditsLast24Hours: count(row.video_committed_credits_last_24_hours),
      },
      media: {
        uploadsLast24Hours: count(row.media_uploads_last_24_hours),
        uploadedBytesLast24Hours: count(row.media_uploaded_bytes_last_24_hours),
      },
      commerce: {
        pendingOrders: count(row.commerce_pending_orders),
        refundsAwaitingResolution: count(row.commerce_refunds_awaiting_resolution),
      },
      accountDeletion: {
        runnableTasks: count(row.deletion_runnable_tasks),
        failedTasks: count(row.deletion_failed_tasks),
      },
    };
  }
}
