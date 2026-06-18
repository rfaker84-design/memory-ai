// POST /api/auth/login — 用户登录
import { NextRequest, NextResponse } from "next/server";
import { loginUser } from "../../../../src/lib/auth";

export async function POST(req: NextRequest) {
  try {
    const { phone } = await req.json();
    if (!phone || !phone.trim()) {
      return NextResponse.json({ error: "手机号不能为空" }, { status: 400 });
    }

    const result = await loginUser(phone.trim());

    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 401 });
    }

    return NextResponse.json({
      userId: result.userId,
      phone: result.phone,
      sessionToken: result.sessionToken,
      isNewUser: result.isNewUser,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "登录失败";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
