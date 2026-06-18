// GET /api/admin/stats — 管理后台统计数据
import { NextRequest, NextResponse } from "next/server";
import { verifySession, getUserStats, getAllUsers } from "../../../../src/lib/auth";
import { getRevenueStats, getUserOrders } from "../../../../src/lib/payment";
import { getSystemStats } from "../../../../src/lib/costCenter";
import { getQueueStats } from "../../../../src/lib/queue";
import { getTenantStats } from "../../../../src/lib/tenantManager";
import { getSessionStats } from "../../../../src/lib/sessionManager";
import { getCacheStats } from "../../../../src/lib/llmCache";
import { getTTSCacheStats } from "../../../../src/lib/ttsCache";
import { getAvatarStats } from "../../../../src/lib/avatarManager";

export async function GET(req: NextRequest) {
  // Auth check (admin)
  const authHeader = req.headers.get("authorization") || "";
  const token = authHeader.replace("Bearer ", "");
  const session = verifySession(token);
  if (!session) {
    return NextResponse.json({ error: "请先登录" }, { status: 401 });
  }

  const [users, revenue, system, queue, tenants, sessions, llmCache, ttsCache, avatarCache] =
    await Promise.all([
      getUserStats(),
      getRevenueStats(),
      Promise.resolve(getSystemStats()),
      Promise.resolve(getQueueStats()),
      Promise.resolve(getTenantStats()),
      Promise.resolve(getSessionStats()),
      Promise.resolve(getCacheStats()),
      Promise.resolve(getTTSCacheStats()),
      Promise.resolve(getAvatarStats()),
    ]);

  return NextResponse.json({
    users,
    revenue: {
      todayYuan: (revenue.today / 100).toFixed(2),
      monthYuan: (revenue.thisMonth / 100).toFixed(2),
      totalYuan: (revenue.total / 100).toFixed(2),
      orderCount: revenue.orderCount,
    },
    system: {
      totalCalls: system.totalCalls,
      todayCostYuan: (system.todayCost / 100).toFixed(2),
      totalCostYuan: (system.totalCost / 100).toFixed(2),
    },
    queue,
    tenants,
    sessions,
    cache: {
      llm: llmCache,
      tts: ttsCache,
      avatar: avatarCache,
    },
  });
}
