import { queryPostgres, withPostgresTransaction } from "@/src/server/database";

export const PRODUCT_INTERACTION_SCHEMA_VERSION = 1 as const;
export const PRODUCT_INTERACTION_EVENTS = [
  "guest_experience_started",
  "photo_upload_succeeded",
  "first_presence_video_played_3s",
  "paywall_viewed",
] as const;

export type ProductInteractionEventName = (typeof PRODUCT_INTERACTION_EVENTS)[number];
export type ProductMetricsEnvironment = "staging" | "production";
export type ProductInteractionProperties =
  | { surface: "guest_home" }
  | { surface: "first_presence" }
  | { elapsed_ms: 3000; job_id?: string }
  | { surface: "commerce"; offer_id?: string };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const KEY = /^[-A-Za-z0-9._:]{16,160}$/;
const SAFE_DIMENSION = /^[a-z0-9._:-]{1,64}$/;

export class ProductMetricsError extends Error {
  constructor(readonly code: "METRICS_ENVIRONMENT_INVALID" | "METRICS_INPUT_INVALID" | "METRICS_OWNER_NOT_FOUND") {
    super(code);
  }
}

export function productMetricsEnvironment(environment: NodeJS.ProcessEnv = process.env): ProductMetricsEnvironment {
  const value = environment.DEPLOYMENT_ENV;
  if (value === "staging" || value === "production") return value;
  throw new ProductMetricsError("METRICS_ENVIRONMENT_INVALID");
}

function validOptionalUuid(value: string | undefined): string | null {
  if (value === undefined) return null;
  if (!UUID.test(value)) throw new ProductMetricsError("METRICS_INPUT_INVALID");
  return value;
}

function validProperties(eventName: ProductInteractionEventName, value: ProductInteractionProperties | undefined): ProductInteractionProperties {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new ProductMetricsError("METRICS_INPUT_INVALID");
  const properties = value as Record<string, unknown>;
  if (eventName === "guest_experience_started" && Object.keys(properties).length === 1 && properties.surface === "guest_home") return value;
  if (eventName === "photo_upload_succeeded" && Object.keys(properties).length === 1 && properties.surface === "first_presence") return value;
  if (eventName === "first_presence_video_played_3s"
    && properties.elapsed_ms === 3000
    && Object.keys(properties).every((key) => key === "elapsed_ms" || key === "job_id")
    && (properties.job_id === undefined || (typeof properties.job_id === "string" && UUID.test(properties.job_id)))) return value;
  if (eventName === "paywall_viewed"
    && properties.surface === "commerce"
    && Object.keys(properties).every((key) => key === "surface" || key === "offer_id")
    && (properties.offer_id === undefined || (typeof properties.offer_id === "string" && SAFE_DIMENSION.test(properties.offer_id)))) return value;
  throw new ProductMetricsError("METRICS_INPUT_INVALID");
}

export type RecordProductInteractionInput = {
  schemaVersion: typeof PRODUCT_INTERACTION_SCHEMA_VERSION;
  eventName: ProductInteractionEventName;
  idempotencyKey: string;
  source: "web" | "server" | "worker" | "import";
  externalUserId?: string;
  anonymousSessionId?: string;
  memoryId?: string;
  requestId?: string;
  properties: ProductInteractionProperties;
  occurredAt?: Date;
};

export class ProductMetricsPostgresDataSource {
  async recordInteraction(input: RecordProductInteractionInput): Promise<{ recorded: boolean }> {
    if (input.schemaVersion !== PRODUCT_INTERACTION_SCHEMA_VERSION || !PRODUCT_INTERACTION_EVENTS.includes(input.eventName) || !KEY.test(input.idempotencyKey)) {
      throw new ProductMetricsError("METRICS_INPUT_INVALID");
    }
    if (!input.externalUserId && !input.anonymousSessionId) throw new ProductMetricsError("METRICS_INPUT_INVALID");
    const anonymousSessionId = validOptionalUuid(input.anonymousSessionId);
    const memoryId = validOptionalUuid(input.memoryId);
    const requestId = validOptionalUuid(input.requestId);
    const properties = validProperties(input.eventName, input.properties);
    const occurredAt = input.occurredAt ?? new Date();
    if (Number.isNaN(occurredAt.getTime())) throw new ProductMetricsError("METRICS_INPUT_INVALID");
    const environment = productMetricsEnvironment();

    return withPostgresTransaction(async (client) => {
      let ownerId: string | null = null;
      let isSynthetic = false;
      if (input.externalUserId) {
        const owner = await client.query<{ id: string }>(
          "SELECT id FROM public.users WHERE external_id=$1 FOR KEY SHARE",
          [input.externalUserId],
        );
        ownerId = owner.rows[0]?.id ?? null;
        if (!ownerId) throw new ProductMetricsError("METRICS_OWNER_NOT_FOUND");
        if (memoryId) {
          const memory = await client.query(
            "SELECT 1 FROM public.memories WHERE id=$1::uuid AND user_id=$2::uuid FOR KEY SHARE",
            [memoryId, ownerId],
          );
          if (!memory.rows[0]) throw new ProductMetricsError("METRICS_INPUT_INVALID");
        }
        const flag = await client.query<{ subject_kind: "synthetic" | "internal" }>(
          "SELECT subject_kind FROM public.product_metrics_subject_flags WHERE environment=$1 AND user_id=$2::uuid",
          [environment, ownerId],
        );
        isSynthetic = flag.rows[0]?.subject_kind === "synthetic" || flag.rows[0]?.subject_kind === "internal";
      }
      const subjectKey = ownerId ? `owner:${ownerId}` : `anon:${anonymousSessionId}`;
      const result = await client.query(
        `INSERT INTO public.product_interaction_events
          (event_name, schema_version, occurred_at, environment, owner_id, anonymous_session_id, subject_key, memory_id,
           request_id, idempotency_key, source, properties, is_synthetic)
         VALUES ($1,$2,$3,$4,$5,$6::uuid,$7,$8::uuid,$9::uuid,$10,$11,$12::jsonb,$13)
         ON CONFLICT (environment, event_name, schema_version, subject_key, idempotency_key) DO NOTHING
         RETURNING id`,
        [input.eventName, input.schemaVersion, occurredAt, environment, ownerId, ownerId ? null : anonymousSessionId,
          subjectKey, memoryId, requestId, input.idempotencyKey, input.source, JSON.stringify(properties), isSynthetic],
      );
      return { recorded: result.rowCount === 1 };
    }, { preserveError: (error) => error instanceof ProductMetricsError });
  }

  async markSubject(input: { externalUserId: string; subjectKind: "synthetic" | "internal" }): Promise<void> {
    const environment = productMetricsEnvironment();
    await queryPostgres(
      `INSERT INTO public.product_metrics_subject_flags (environment, user_id, subject_kind)
       SELECT $1, id, $3 FROM public.users WHERE external_id=$2
       ON CONFLICT (environment, user_id) DO UPDATE SET subject_kind=EXCLUDED.subject_kind, updated_at=NOW()`,
      [environment, input.externalUserId, input.subjectKind],
    );
  }
}

export type CostLedgerEntryInput = {
  costCategory: "sms" | "llm_chat" | "video_generation" | "voice_generation" | "media_storage" | "payment_fee" | "manual_review_estimate" | "refund_cost" | "other_provider";
  provider: string;
  sourceType: string;
  sourceId: string;
  quantity: number;
  unit: string;
  amountMinor: number;
  currency: string;
  basis: "actual" | "estimated";
  rateCardVersion?: string;
  idempotencyKey: string;
  isMock?: boolean;
  occurredAt?: Date;
};

export async function recordCostLedgerEntry(input: CostLedgerEntryInput): Promise<{ recorded: boolean }> {
  const environment = productMetricsEnvironment();
  if (!KEY.test(input.idempotencyKey) || !SAFE_DIMENSION.test(input.provider) || !SAFE_DIMENSION.test(input.sourceType)
    || !/^[-A-Za-z0-9._:]{1,160}$/.test(input.sourceId) || !SAFE_DIMENSION.test(input.unit)
    || !/^[A-Z]{3}$/.test(input.currency) || !Number.isFinite(input.quantity) || input.quantity < 0
    || !Number.isInteger(input.amountMinor) || input.amountMinor < 0) {
    throw new ProductMetricsError("METRICS_INPUT_INVALID");
  }
  const isMock = input.isMock ?? false;
  if (isMock !== (environment === "staging") || (isMock && input.amountMinor !== 0)) {
    throw new ProductMetricsError("METRICS_INPUT_INVALID");
  }
  const result = await queryPostgres(
    `INSERT INTO public.cost_ledger_entries
      (environment, cost_category, provider, source_type, source_id, occurred_at, quantity,
       unit, amount_minor, currency, basis, rate_card_version, reconciliation_status,
       idempotency_key, is_mock)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
     ON CONFLICT (environment, idempotency_key) DO NOTHING
     RETURNING id`,
    [environment, input.costCategory, input.provider, input.sourceType, input.sourceId,
      input.occurredAt ?? new Date(), input.quantity, input.unit, input.amountMinor,
      input.currency, input.basis, input.rateCardVersion ?? null,
      isMock ? "mock" : "unreconciled", input.idempotencyKey, isMock],
  );
  return { recorded: result.rowCount === 1 };
}
