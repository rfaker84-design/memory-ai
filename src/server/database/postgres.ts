import {
  Pool,
  type PoolClient,
  type PoolConfig,
  type QueryResult,
  type QueryResultRow,
} from "pg";

import {
  classifyDatabaseError,
  DatabaseDependencyError,
  safeDatabaseErrorLog,
} from "./errors";

type GlobalDatabaseState = typeof globalThis & {
  memoryAiPostgresPool?: Pool;
};

const globalDatabase = globalThis as GlobalDatabaseState;

function integerSetting(
  name: string,
  fallback: number,
  minimum: number,
  maximum: number
): number {
  const raw = process.env[name];
  const parsed = raw ? Number.parseInt(raw, 10) : fallback;

  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(maximum, Math.max(minimum, parsed));
}

function poolConfig(): PoolConfig {
  const connectionString = process.env.DATABASE_URL;

  if (!connectionString) {
    throw new DatabaseDependencyError("query_failed", "DATABASE_NOT_CONFIGURED");
  }

  return {
    connectionString,
    max: integerSetting("DATABASE_POOL_MAX", 10, 1, 40),
    connectionTimeoutMillis: integerSetting(
      "DATABASE_CONNECTION_TIMEOUT_MS",
      5_000,
      500,
      30_000
    ),
    idleTimeoutMillis: integerSetting(
      "DATABASE_IDLE_TIMEOUT_MS",
      30_000,
      1_000,
      300_000
    ),
    allowExitOnIdle: process.env.NODE_ENV !== "production",
    ssl:
      process.env.DATABASE_SSL?.toLowerCase() === "true"
        ? { rejectUnauthorized: true }
        : false,
  };
}

export function getPostgresPool(): Pool {
  if (!globalDatabase.memoryAiPostgresPool) {
    const pool = new Pool(poolConfig());
    pool.on("error", (error) => {
      console.error(
        "[database] idle PostgreSQL client failed",
        safeDatabaseErrorLog(error)
      );
    });
    globalDatabase.memoryAiPostgresPool = pool;
  }

  return globalDatabase.memoryAiPostgresPool;
}

export async function queryPostgres<Row extends QueryResultRow = QueryResultRow>(
  text: string,
  values: readonly unknown[] = [],
  timeoutMs?: number
): Promise<QueryResult<Row>> {
  try {
    return await getPostgresPool().query<Row>({
      text,
      values: [...values],
      ...(timeoutMs ? { query_timeout: timeoutMs } : {}),
    });
  } catch (error) {
    throw classifyDatabaseError(error);
  }
}

export async function withPostgresTransaction<T>(
  work: (client: PoolClient) => Promise<T>,
  options?: { preserveError?: (error: unknown) => boolean }
): Promise<T> {
  let client: PoolClient | undefined;

  try {
    client = await getPostgresPool().connect();
    await client.query("BEGIN");
    const result = await work(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    if (client) {
      try {
        await client.query("ROLLBACK");
      } catch (rollbackError) {
        console.error(
          "[database] PostgreSQL rollback failed",
          safeDatabaseErrorLog(rollbackError)
        );
      }
    }

    if (options?.preserveError?.(error)) throw error;
    throw classifyDatabaseError(error);
  } finally {
    client?.release();
  }
}

export async function closePostgresPool(): Promise<void> {
  const pool = globalDatabase.memoryAiPostgresPool;
  if (!pool) return;

  globalDatabase.memoryAiPostgresPool = undefined;
  await pool.end();
}
