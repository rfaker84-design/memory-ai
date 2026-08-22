import { closePostgresPool } from "../../src/server/database";
import { buildProductMetricsReport, productMetricsCsv } from "../../features/product-metrics/report";
import { productMetricsEnvironment } from "../../features/product-metrics";

function option(name: string): string | null {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] ?? null : null;
}
function day(value: string | null, end = false): Date {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error(`INVALID_${end ? "TO" : "FROM"}`);
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime())) throw new Error(`INVALID_${end ? "TO" : "FROM"}`);
  if (end) parsed.setUTCDate(parsed.getUTCDate() + 1);
  return parsed;
}

async function main(): Promise<void> {
  const environment = option("environment");
  if (environment !== "staging" && environment !== "production") throw new Error("INVALID_ENVIRONMENT");
  if (productMetricsEnvironment() !== environment) throw new Error("METRICS_ENVIRONMENT_MISMATCH");
  const report = await buildProductMetricsReport({ from: day(option("from")), to: day(option("to"), true), environment });
  const format = option("format") ?? "json";
  if (format === "json") process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  else if (format === "csv") process.stdout.write(`${productMetricsCsv(report)}\n`);
  else throw new Error("INVALID_FORMAT");
}

main().finally(() => closePostgresPool()).catch((error) => {
  process.stderr.write(`metrics report failed: ${(error as Error).message}\n`);
  process.exitCode = 1;
});
