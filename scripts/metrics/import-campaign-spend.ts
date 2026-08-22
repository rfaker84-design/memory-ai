import { readFile } from "node:fs/promises";
import { closePostgresPool, queryPostgres } from "../../src/server/database";
import { productMetricsEnvironment } from "../../features/product-metrics";

const DIMENSION = /^[a-z0-9._:-]{1,80}$/;
const KEY = /^[-A-Za-z0-9._:]{16,160}$/;
function option(name: string): string | null { const index = process.argv.indexOf(`--${name}`); return index < 0 ? null : process.argv[index + 1] ?? null; }
function rows(csv: string): Record<string, string>[] {
  const [header, ...lines] = csv.trim().split(/\r?\n/);
  const fields = header?.split(",").map((value) => value.trim()) ?? [];
  const required = ["channel", "campaign", "date", "spend_minor", "currency", "source_reference", "idempotency_key"];
  if (required.some((field) => !fields.includes(field))) throw new Error("INVALID_CSV_HEADER");
  return lines.filter(Boolean).map((line) => {
    const values = line.split(",");
    if (values.length !== fields.length) throw new Error("CSV_QUOTING_NOT_SUPPORTED");
    return Object.fromEntries(fields.map((field, index) => [field, values[index]!.trim()]));
  });
}
async function main(): Promise<void> {
  const environment = option("environment"); const file = option("file");
  if ((environment !== "staging" && environment !== "production") || !file || productMetricsEnvironment() !== environment) throw new Error("INVALID_IMPORT_ENVIRONMENT");
  let imported = 0;
  for (const row of rows(await readFile(file, "utf8"))) {
    if (!DIMENSION.test(row.channel) || !DIMENSION.test(row.campaign) || !/^\d{4}-\d{2}-\d{2}$/.test(row.date)
      || !/^\d+$/.test(row.spend_minor) || !/^[A-Z]{3}$/.test(row.currency) || !row.source_reference || row.source_reference.length > 160 || !KEY.test(row.idempotency_key)) throw new Error("INVALID_CSV_ROW");
    const result = await queryPostgres(
      `INSERT INTO public.campaign_spend_imports (environment,channel,campaign,spend_date,spend_minor,currency,source_reference,idempotency_key)
       VALUES ($1,$2,$3,$4::date,$5::bigint,$6,$7,$8) ON CONFLICT (environment,idempotency_key) DO NOTHING RETURNING id`,
      [environment,row.channel,row.campaign,row.date,row.spend_minor,row.currency,row.source_reference,row.idempotency_key],
    );
    imported += result.rowCount ?? 0;
  }
  process.stdout.write(`campaign spend rows imported: ${imported}\n`);
}
main().finally(() => closePostgresPool()).catch((error) => { process.stderr.write(`campaign spend import failed: ${(error as Error).message}\n`); process.exitCode = 1; });
