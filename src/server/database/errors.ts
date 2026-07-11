export type DatabaseErrorCategory =
  | "timeout"
  | "dns"
  | "authentication"
  | "connection_refused"
  | "tls"
  | "query_failed";

const SAFE_ERROR_CODE = /^[A-Za-z0-9_-]{1,64}$/;

function readErrorCode(error: unknown): string | undefined {
  if (!error || typeof error !== "object") return undefined;

  const value = (error as Record<string, unknown>).code;
  return typeof value === "string" && SAFE_ERROR_CODE.test(value)
    ? value
    : undefined;
}

function collectSignals(error: unknown, signals: string[] = []): string[] {
  if (error instanceof Error) {
    signals.push(error.name, error.message);
    collectSignals(error.cause, signals);
    return signals;
  }

  if (!error || typeof error !== "object") return signals;

  const record = error as Record<string, unknown>;
  for (const key of ["name", "code", "message", "detail", "hint"]) {
    if (typeof record[key] === "string") signals.push(record[key]);
  }
  collectSignals(record.cause, signals);

  return signals;
}

export class DatabaseDependencyError extends Error {
  readonly category: DatabaseErrorCategory;
  readonly safeCode?: string;

  constructor(
    category: DatabaseErrorCategory,
    safeCode?: string,
    options?: ErrorOptions
  ) {
    super("Database dependency unavailable", options);
    this.name = "DatabaseDependencyError";
    this.category = category;
    this.safeCode = safeCode;
  }
}

export function classifyDatabaseError(error: unknown): DatabaseDependencyError {
  if (error instanceof DatabaseDependencyError) return error;

  const signal = collectSignals(error).join(" ").toUpperCase();
  const code = readErrorCode(error);

  if (
    code === "57014" ||
    signal.includes("TIMEOUT") ||
    signal.includes("ABORT") ||
    signal.includes("QUERY READ TIMEOUT")
  ) {
    return new DatabaseDependencyError("timeout", code, { cause: error });
  }

  if (
    code === "ENOTFOUND" ||
    code === "EAI_AGAIN" ||
    signal.includes("ENOTFOUND") ||
    signal.includes("EAI_AGAIN")
  ) {
    return new DatabaseDependencyError("dns", code, { cause: error });
  }

  if (
    code === "28P01" ||
    code === "28000" ||
    signal.includes("PASSWORD AUTHENTICATION FAILED") ||
    signal.includes("NO PG_HBA.CONF ENTRY")
  ) {
    return new DatabaseDependencyError("authentication", code, {
      cause: error,
    });
  }

  if (
    code === "ECONNREFUSED" ||
    signal.includes("ECONNREFUSED") ||
    signal.includes("CONNECTION REFUSED")
  ) {
    return new DatabaseDependencyError("connection_refused", code, {
      cause: error,
    });
  }

  if (
    signal.includes("TLS") ||
    signal.includes("CERTIFICATE") ||
    signal.includes("SELF SIGNED") ||
    signal.includes("UNABLE_TO_VERIFY_LEAF_SIGNATURE")
  ) {
    return new DatabaseDependencyError("tls", code, { cause: error });
  }

  return new DatabaseDependencyError("query_failed", code, { cause: error });
}

export function safeDatabaseErrorLog(error: unknown) {
  const classified = classifyDatabaseError(error);

  return {
    category: classified.category,
    code: classified.safeCode ?? "unavailable",
  };
}
