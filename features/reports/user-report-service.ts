import { withPostgresTransaction } from "@/src/server/database";

export const REPORT_CATEGORIES = ["rights", "privacy", "safety", "payment", "account", "other"] as const;
export const REPORT_SUBJECT_TYPES = ["memory", "media", "video", "account", "payment", "other"] as const;
export const REPORT_ACTIONS = ["review", "remove_content", "refund", "account_help", "other"] as const;

export type UserReport = {
  id: string;
  category: (typeof REPORT_CATEGORIES)[number];
  subjectType: (typeof REPORT_SUBJECT_TYPES)[number];
  subjectId: string | null;
  requestedAction: (typeof REPORT_ACTIONS)[number];
  status: "received" | "triaged" | "actioned" | "closed";
  createdAt: string;
  resolvedAt: string | null;
};

const OWNED_SUBJECT_TABLES = {
  memory: "memories",
  media: "media_assets",
  video: "video_generation_jobs",
  payment: "payment_orders",
} as const;

type Row = { id: string; category: UserReport["category"]; subject_type: UserReport["subjectType"]; subject_id: string | null; requested_action: UserReport["requestedAction"]; status: UserReport["status"]; created_at: Date; resolved_at: Date | null };
const toReport = (row: Row): UserReport => ({ id: row.id, category: row.category, subjectType: row.subject_type, subjectId: row.subject_id, requestedAction: row.requested_action, status: row.status, createdAt: row.created_at.toISOString(), resolvedAt: row.resolved_at?.toISOString() ?? null });

export class UserReportError extends Error {
  constructor(readonly code: "REPORTER_NOT_FOUND" | "SUBJECT_NOT_FOUND") { super(code); }
}

export class PostgresUserReportService {
  async dispose(input: { reportId: string; status: "triaged" | "actioned" | "closed"; disposition: string; reviewer: string }): Promise<UserReport> {
    return withPostgresTransaction(async (client) => {
      const row = await client.query<Row>(
        `UPDATE public.user_reports SET status=$2, disposition=$3, handled_by=$4, resolved_at=CASE WHEN $2 IN ('actioned','closed') THEN NOW() ELSE NULL END, updated_at=NOW()
          WHERE id=$1::uuid AND status <> 'closed'
          RETURNING id, category, subject_type, subject_id, requested_action, status, created_at, resolved_at`,
        [input.reportId, input.status, input.disposition, input.reviewer],
      );
      if (!row.rows[0]) throw new UserReportError("SUBJECT_NOT_FOUND");
      return toReport(row.rows[0]);
    }, { preserveError: (error) => error instanceof UserReportError });
  }
  async create(input: { userId: string; externalUserId: string; requestKey: string; category: UserReport["category"]; subjectType: UserReport["subjectType"]; subjectId: string | null; requestedAction: UserReport["requestedAction"]; details: string }): Promise<UserReport> {
    return withPostgresTransaction(async (client) => {
      const reporter = await client.query<{ id: string }>("SELECT id FROM public.users WHERE id=$1::uuid AND external_id=$2 FOR KEY SHARE", [input.userId, input.externalUserId]);
      if (reporter.rowCount !== 1) throw new UserReportError("REPORTER_NOT_FOUND");
      const subjectTable = OWNED_SUBJECT_TABLES[input.subjectType as keyof typeof OWNED_SUBJECT_TABLES];
      if (subjectTable) {
        // The table name comes only from this closed mapping.  A report must
        // never become a cross-owner probe for opaque media, video, or order
        // identifiers supplied by a client.
        const subject = await client.query(`SELECT 1 FROM public.${subjectTable} WHERE id=$1::uuid AND user_id=$2::uuid FOR KEY SHARE`, [input.subjectId, input.userId]);
        if (subject.rowCount !== 1) throw new UserReportError("SUBJECT_NOT_FOUND");
      }
      if (input.subjectType === "account" && input.subjectId !== input.userId) throw new UserReportError("SUBJECT_NOT_FOUND");
      const row = await client.query<Row>(
        `INSERT INTO public.user_reports (reporter_user_id, request_key, category, subject_type, subject_id, requested_action, details)
         VALUES ($1::uuid,$2,$3,$4,$5::uuid,$6,$7)
         ON CONFLICT (reporter_user_id, request_key) DO UPDATE SET request_key=EXCLUDED.request_key
         RETURNING id, category, subject_type, subject_id, requested_action, status, created_at, resolved_at`,
        [input.userId, input.requestKey, input.category, input.subjectType, input.subjectId, input.requestedAction, input.details],
      );
      if (!row.rows[0]) throw new Error("REPORT_CREATE_UNAVAILABLE");
      return toReport(row.rows[0]);
    }, { preserveError: (error) => error instanceof UserReportError });
  }

  async list(input: { userId: string; externalUserId: string }): Promise<UserReport[]> {
    return withPostgresTransaction(async (client) => {
      const rows = await client.query<Row>(
        `SELECT r.id, r.category, r.subject_type, r.subject_id, r.requested_action, r.status, r.created_at, r.resolved_at
         FROM public.user_reports r JOIN public.users u ON u.id=r.reporter_user_id
         WHERE r.reporter_user_id=$1::uuid AND u.external_id=$2 ORDER BY r.created_at DESC LIMIT 50`,
        [input.userId, input.externalUserId],
      );
      return rows.rows.map(toReport);
    });
  }
}
