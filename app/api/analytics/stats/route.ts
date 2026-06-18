// GET /api/analytics/stats — 分析数据汇总
import { NextRequest, NextResponse } from "next/server";
import { verifySession } from "../../../../src/lib/auth";
import { getGrowthMetrics } from "../../../../src/lib/growth";
import { getStickinessStats } from "../../../../src/lib/emotionalStickiness";
import { getReferralLeaderboard } from "../../../../src/lib/referral";
import { getRecentAnalytics, getAnalyticsSummary } from "../../../../src/lib/analytics";

export async function GET(req: NextRequest) {
  const token = (req.headers.get("authorization") || "").replace("Bearer ", "");
  const session = verifySession(token);
  if (!session) return NextResponse.json({ error: "请先登录" }, { status: 401 });

  const [growth, stickiness, leaderboard, recentEvents] = await Promise.all([
    getGrowthMetrics(),
    Promise.resolve(getStickinessStats()),
    getReferralLeaderboard(10),
    Promise.resolve(getRecentAnalytics(200)),
  ]);

  const summary = getAnalyticsSummary(recentEvents);

  return NextResponse.json({
    growth,
    stickiness,
    leaderboard,
    funnel: {
      steps: [
        { step: "page_view", users: summary.byEvent["page_view"] || 0 },
        { step: "memory_create", users: summary.byEvent["memory_create"] || 0 },
        { step: "chat_message", users: summary.byEvent["chat_message"] || 0 },
      ],
    },
    today: {
      events: summary.todayEvents,
      users: summary.uniqueUsers,
    },
  });
}
