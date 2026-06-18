// POST /api/referral/generate — 生成邀请码
import { NextRequest, NextResponse } from "next/server";
import { verifySession } from "../../../../src/lib/auth";
import { generateReferralCode, getUserReferralStats } from "../../../../src/lib/referral";

export async function POST(req: NextRequest) {
  const token = (req.headers.get("authorization") || "").replace("Bearer ", "");
  const session = verifySession(token);
  if (!session) return NextResponse.json({ error: "请先登录" }, { status: 401 });

  const code = await generateReferralCode(session.userId);
  return NextResponse.json({ code });
}

export async function GET(req: NextRequest) {
  const token = (req.headers.get("authorization") || "").replace("Bearer ", "");
  const session = verifySession(token);
  if (!session) return NextResponse.json({ error: "请先登录" }, { status: 401 });

  const stats = await getUserReferralStats(session.userId);
  return NextResponse.json(stats || { code: null, totalInvites: 0 });
}
