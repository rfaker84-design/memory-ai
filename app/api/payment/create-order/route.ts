// POST /api/payment/create-order — 创建支付订单
import { NextRequest, NextResponse } from "next/server";
import { createOrder, type PaymentProvider, type PlanType } from "../../../../src/lib/payment";
import { verifySession } from "../../../../src/lib/auth";

export async function POST(req: NextRequest) {
  try {
    // Auth check
    const authHeader = req.headers.get("authorization") || "";
    const token = authHeader.replace("Bearer ", "");
    const session = verifySession(token);
    if (!session) {
      return NextResponse.json({ error: "请先登录" }, { status: 401 });
    }

    const { plan, billing, provider } = await req.json();
    if (!plan || plan === "free") {
      return NextResponse.json({ error: "无效套餐" }, { status: 400 });
    }

    const result = await createOrder(
      session.userId,
      plan as PlanType,
      (billing as "monthly" | "yearly") || "monthly",
      (provider as PaymentProvider) || "wechat",
    );

    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    return NextResponse.json({
      orderId: result.orderId,
      payUrl: result.payUrl || null,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "创建订单失败";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
