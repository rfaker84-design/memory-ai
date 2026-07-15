import { NextResponse } from "next/server";

export async function POST() {
  return NextResponse.json({
    error: "PHONE_VERIFICATION_REQUIRED",
    endpoint: "/api/auth/send-code",
  }, { status: 410 });
}
