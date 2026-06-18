import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({ status: "disabled", reason: "production-safe mode" });
}

export async function POST() {
  return NextResponse.json({ status: "disabled", reason: "production-safe mode" });
}