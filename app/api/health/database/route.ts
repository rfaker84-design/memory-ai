import {
  classifyDatabaseError,
  queryPostgres,
  safeDatabaseErrorLog,
} from "@/src/server/database";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const HEALTH_QUERY_TIMEOUT_MS = 5_000;

function response(body: object, status: number) {
  return Response.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

export async function GET() {
  const startedAt = Date.now();

  try {
    await queryPostgres("SELECT 1", [], HEALTH_QUERY_TIMEOUT_MS);
    return response({ status: "ok" }, 200);
  } catch (error) {
    const classified = classifyDatabaseError(error);
    console.error("[health:database] PostgreSQL check failed", {
      ...safeDatabaseErrorLog(classified),
      durationMs: Date.now() - startedAt,
    });

    return response(
      {
        status: "error",
        category: classified.category,
        message: "Database dependency unavailable",
      },
      503
    );
  }
}
