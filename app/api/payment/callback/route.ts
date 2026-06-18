// GET /api/payment/callback — 支付回调处理
import { NextRequest, NextResponse } from "next/server";
import { completeOrder } from "../../../../src/lib/payment";

export async function GET(req: NextRequest) {
  try {
    const orderId = req.nextUrl.searchParams.get("orderId");
    const transactionId = req.nextUrl.searchParams.get("transactionId") || undefined;
    const status = req.nextUrl.searchParams.get("status") || "success";

    if (!orderId) {
      return NextResponse.json({ error: "缺少订单号" }, { status: 400 });
    }

    if (status !== "success") {
      return NextResponse.json({ error: "支付未成功" }, { status: 400 });
    }

    const result = await completeOrder(orderId, transactionId);

    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 500 });
    }

    // 支付成功，重定向到会员页
    return NextResponse.redirect(new URL("/profile?payment=success", req.url));
  } catch (err) {
    const msg = err instanceof Error ? err.message : "回调处理失败";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  return GET(req);
}
