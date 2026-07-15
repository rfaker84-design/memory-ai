import { NextResponse } from "next/server";

export async function POST() {
  return NextResponse.json({
    error: "AUTH_ENDPOINT_MIGRATED",
    endpoint: "/api/auth/verify-code",
  }, { status: 410 });
}
