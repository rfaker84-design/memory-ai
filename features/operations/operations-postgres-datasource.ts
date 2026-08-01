import { queryPostgres } from "@/src/server/database";

export type OperationsSummary = {
  observedAt: string;
  video: {
    active: number;
    submissionUncertain: number;
    manualReview: number;
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
  video_manual_review: string;
  commerce_pending_orders: string;
  commerce_refunds_awaiting_resolution: string;
  deletion_runnable_tasks: string;
  deletion_failed_tasks: string;
};

function count(value: string): number {
  const parsed = Number.parseInt(value, 10);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : 0;
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
          WHERE status = 'manual_review_required' OR quality_status = 'pending') AS video_manual_review,
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
        manualReview: count(row.video_manual_review),
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
