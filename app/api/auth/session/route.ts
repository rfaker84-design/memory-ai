// GET /api/auth/session — 验证 session 并返回用户信息
import { NextRequest, NextResponse } from "next/server";
import { verifySession, getUserProfile } from "../../../../src/lib/auth";

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization") || "";
  const token = authHeader.replace("Bearer ", "");

  if (!token) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }

  const session = verifySession(token);
  if (!session) {
    return NextResponse.json({ error: "登录已过期" }, { status: 401 });
  }

  const profile = await getUserProfile(session.userId);
  if (!profile) {
    return NextResponse.json({ error: "用户不存在" }, { status: 404 });
  }

  return NextResponse.json({
    userId: profile.userId,
    phone: profile.phone,
    tier: profile.tier,
    createdAt: profile.createdAt,
    lastLoginAt: profile.lastLoginAt,
  });
}
