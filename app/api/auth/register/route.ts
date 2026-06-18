// POST /api/auth/register — 用户注册
import { NextRequest, NextResponse } from "next/server";
import { registerUser } from "../../../../src/lib/auth";

export async function POST(req: NextRequest) {
  try {
    const { phone } = await req.json();
    if (!phone || !phone.trim()) {
      return NextResponse.json({ error: "手机号不能为空" }, { status: 400 });
    }

    const result = await registerUser(phone.trim());

    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    return NextResponse.json({
      userId: result.userId,
      phone: result.phone,
      sessionToken: result.sessionToken,
      isNewUser: result.isNewUser,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "注册失败";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
