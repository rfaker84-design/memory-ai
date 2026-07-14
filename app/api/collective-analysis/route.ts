import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * This legacy endpoint depended on Supabase-only memory_entity_state data that
 * is not part of the formal PostgreSQL schema. It stays explicit and fail-closed
 * until a controlled PostgreSQL migration provides an approved repository.
 */
export async function GET(req: NextRequest) {
  const phone = req.nextUrl.searchParams.get("phone")?.trim();
  if (!phone) {
    return NextResponse.json(
      { error: "INVALID_REQUEST", message: "phone is required" },
      { status: 400 }
    );
  }

  return NextResponse.json(
    {
      error: "COLLECTIVE_ANALYSIS_UNAVAILABLE",
      message: "This legacy analysis data source is not available",
    },
    { status: 503 }
  );
}
