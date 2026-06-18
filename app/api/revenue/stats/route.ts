// GET /api/revenue/stats — 收入数据汇总
import { NextRequest, NextResponse } from "next/server";
import { verifySession } from "../../../../src/lib/auth";
import { getConversionMetrics } from "../../../../src/lib/conversion";
import { getProgressStats } from "../../../../src/lib/userProgress";
import { getStickinessStats } from "../../../../src/lib/emotionalStickiness";
import { getLoopStats } from "../../../../src/lib/engagementLoop";
import { getRevenueStats } from "../../../../src/lib/payment";

export async function GET(req: NextRequest) {
  const token = (req.headers.get("authorization") || "").replace("Bearer ", "");
  const session = verifySession(token);
  if (!session) return NextResponse.json({ error: "请先登录" }, { status: 401 });

  const [conversion, progress, stickiness, loop, revenue] = await Promise.all([
    Promise.resolve(getConversionMetrics()),
    Promise.resolve(getProgressStats()),
    Promise.resolve(getStickinessStats()),
    Promise.resolve(getLoopStats()),
    getRevenueStats(),
  ]);

  return NextResponse.json({
    conversion,
    progress,
    stickiness: {
      total: stickiness.total,
      avgScore: stickiness.avgScore,
      byLevel: stickiness.byLevel,
    },
    loop: {
      phases: loop.phaseDistribution,
      avgLoopsToAddiction: loop.avgLoopsToAddiction,
    },
    revenue: {
      todayYuan: (revenue.today / 100).toFixed(2),
      monthYuan: (revenue.thisMonth / 100).toFixed(2),
      totalYuan: (revenue.total / 100).toFixed(2),
      orderCount: revenue.orderCount,
    },
  });
}
