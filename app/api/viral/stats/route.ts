// GET /api/viral/stats — 病毒传播数据汇总
import { NextRequest, NextResponse } from "next/server";
import { verifySession } from "../../../../src/lib/auth";
import { getViralMetrics, getViralLoop } from "../../../../src/lib/viral";
import { getUserStats } from "../../../../src/lib/auth";
import { getKOLLeaderboard } from "../../../../src/lib/kol";

export async function GET(req: NextRequest) {
  const token = (req.headers.get("authorization") || "").replace("Bearer ", "");
  const session = verifySession(token);
  if (!session) return NextResponse.json({ error: "请先登录" }, { status: 401 });

  const users = await getUserStats();
  const viral = getViralMetrics(users.total);
  const loop = getViralLoop();
  const kols = getKOLLeaderboard(10);

  return NextResponse.json({
    viral: {
      totalShares: viral.totalShares,
      shareRate: (viral.shareRate * 100).toFixed(1) + "%",
      viralCoefficient: viral.viralCoefficient.toFixed(2),
      sharesByChannel: viral.sharesByChannel,
      conversionByVariant: viral.conversionByVariant,
    },
    loop: {
      steps: loop.steps,
      conversionRate: loop.conversionRate,
      cycleTimeDays: loop.cycleTimeDays,
    },
    kols: kols.map(k => ({
      handle: k.handle,
      platform: k.platform,
      referrals: k.totalReferrals,
      partnership: k.partnership,
    })),
  });
}
