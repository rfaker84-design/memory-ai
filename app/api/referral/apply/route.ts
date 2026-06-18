// POST /api/referral/apply — 使用邀请码
import { NextRequest, NextResponse } from "next/server";
import { verifySession } from "../../../../src/lib/auth";
import { applyReferralCode } from "../../../../src/lib/referral";

export async function POST(req: NextRequest) {
  const token = (req.headers.get("authorization") || "").replace("Bearer ", "");
  const session = verifySession(token);
  if (!session) return NextResponse.json({ error: "请先登录" }, { status: 401 });

  const { code } = await req.json();
  if (!code) return NextResponse.json({ error: "请输入邀请码" }, { status: 400 });

  const result = await applyReferralCode(code, session.userId);
  if (!result.success) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  return NextResponse.json({
    success: true,
    reward: result.reward,
  });
}
