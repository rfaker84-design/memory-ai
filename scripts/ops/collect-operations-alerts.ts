type AlertSeverity = "warning" | "critical";

export type CollectedAlert = {
  code: string;
  severity: AlertSeverity;
  observed: number;
  threshold: number;
};

export type OperationsAlertCollection = {
  observedAt: string;
  alerts: CollectedAlert[];
};

export class OperationsAlertCollectorError extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = "OperationsAlertCollectorError";
  }
}

type FetchLike = (input: URL | string, init?: RequestInit) => Promise<Response>;

function isLoopback(hostname: string): boolean {
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "[::1]";
}

export function parseCollectorConfiguration(environment: Readonly<Record<string, string | undefined>> = process.env): {
  endpoint: URL;
  token: string;
} {
  const rawUrl = environment.OPERATIONS_ALERTS_URL;
  const token = environment.OPERATIONS_METRICS_ACCESS_TOKEN;
  if (!rawUrl || rawUrl !== rawUrl.trim() || !token || token !== token.trim() || Buffer.byteLength(token, "utf8") < 32) {
    throw new OperationsAlertCollectorError("OPERATIONS_ALERT_COLLECTOR_CONFIGURATION_INVALID");
  }

  let endpoint: URL;
  try {
    endpoint = new URL(rawUrl);
  } catch {
    throw new OperationsAlertCollectorError("OPERATIONS_ALERT_COLLECTOR_CONFIGURATION_INVALID");
  }
  if (
    endpoint.username
    || endpoint.password
    || endpoint.search
    || endpoint.hash
    || endpoint.pathname !== "/api/internal/operations/alerts"
    || (endpoint.protocol !== "https:" && !(endpoint.protocol === "http:" && isLoopback(endpoint.hostname)))
  ) {
    throw new OperationsAlertCollectorError("OPERATIONS_ALERT_COLLECTOR_CONFIGURATION_INVALID");
  }
  return { endpoint, token };
}

function isSafeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function parseCollection(value: unknown): OperationsAlertCollection {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new OperationsAlertCollectorError("OPERATIONS_ALERT_COLLECTOR_RESPONSE_INVALID");
  }
  const record = value as Record<string, unknown>;
  if (Object.keys(record).length !== 2 || !("observedAt" in record) || !("alerts" in record) || typeof record.observedAt !== "string" || !Array.isArray(record.alerts)) {
    throw new OperationsAlertCollectorError("OPERATIONS_ALERT_COLLECTOR_RESPONSE_INVALID");
  }
  const observedAt = new Date(record.observedAt);
  if (Number.isNaN(observedAt.getTime())) throw new OperationsAlertCollectorError("OPERATIONS_ALERT_COLLECTOR_RESPONSE_INVALID");

  const alerts = record.alerts.map((value): CollectedAlert => {
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new OperationsAlertCollectorError("OPERATIONS_ALERT_COLLECTOR_RESPONSE_INVALID");
    const alert = value as Record<string, unknown>;
    if (
      Object.keys(alert).length !== 4
      || typeof alert.code !== "string"
      || !/^[A-Z][A-Z0-9_]{2,80}$/.test(alert.code)
      || (alert.severity !== "warning" && alert.severity !== "critical")
      || !isSafeInteger(alert.observed)
      || !isSafeInteger(alert.threshold)
    ) {
      throw new OperationsAlertCollectorError("OPERATIONS_ALERT_COLLECTOR_RESPONSE_INVALID");
    }
    return { code: alert.code, severity: alert.severity, observed: alert.observed, threshold: alert.threshold };
  });
  return { observedAt: observedAt.toISOString(), alerts };
}

export async function collectOperationsAlerts(
  environment: Readonly<Record<string, string | undefined>> = process.env,
  fetcher: FetchLike = fetch,
  timeoutMs = 10_000,
): Promise<OperationsAlertCollection> {
  const { endpoint, token } = parseCollectorConfiguration(environment);
  const timeout = AbortSignal.timeout(timeoutMs);
  let response: Response;
  try {
    response = await fetcher(endpoint, {
      method: "GET",
      headers: { "x-operations-metrics-token": token, accept: "application/json" },
      redirect: "error",
      signal: timeout,
    });
  } catch {
    throw new OperationsAlertCollectorError("OPERATIONS_ALERT_COLLECTOR_UNAVAILABLE");
  }
  if (!response.ok) throw new OperationsAlertCollectorError(`OPERATIONS_ALERT_COLLECTOR_HTTP_${response.status}`);
  try {
    return parseCollection(await response.json());
  } catch (error) {
    if (timeout.aborted) throw new OperationsAlertCollectorError("OPERATIONS_ALERT_COLLECTOR_UNAVAILABLE");
    if (error instanceof OperationsAlertCollectorError) throw error;
    throw new OperationsAlertCollectorError("OPERATIONS_ALERT_COLLECTOR_RESPONSE_INVALID");
  }
}

export function collectorExitCode(collection: OperationsAlertCollection): number {
  return collection.alerts.some((alert) => alert.severity === "critical") ? 2 : 0;
}

async function main(): Promise<void> {
  try {
    const collection = await collectOperationsAlerts();
    console.log(JSON.stringify({ kind: "memoryai.operations.alerts", ...collection }));
    process.exitCode = collectorExitCode(collection);
  } catch (error) {
    const code = error instanceof OperationsAlertCollectorError
      ? error.code
      : "OPERATIONS_ALERT_COLLECTOR_FAILED";
    console.error(JSON.stringify({ kind: "memoryai.operations.alerts.error", code }));
    process.exitCode = 1;
  }
}

if (process.argv[1] && import.meta.url === new URL(process.argv[1], "file:").href) {
  void main();
}
