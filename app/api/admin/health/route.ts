// GET /api/admin/health — 系统健康检查 + 熔断器状态
import { NextRequest, NextResponse } from "next/server";
import { verifySession } from "../../../../src/lib/auth";
import { getSystemHealth, resetShieldStats } from "../../../../src/lib/overloadShield";
import { getAllCircuitStats, resetCircuit, type ServiceName } from "../../../../src/lib/circuitBreaker";
import { getQueueStats } from "../../../../src/lib/queue";
import { getLogStats } from "../../../../src/lib/logger";

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization") || "";
  const token = authHeader.replace("Bearer ", "");
  const session = verifySession(token);
  if (!session) {
    return NextResponse.json({ error: "请先登录" }, { status: 401 });
  }

  const health = getSystemHealth();
  const circuits = getAllCircuitStats();
  const queue = getQueueStats();
  const logs = getLogStats();

  return NextResponse.json({ health, circuits, queue, logs });
}

export async function POST(req: NextRequest) {
  const authHeader = req.headers.get("authorization") || "";
  const token = authHeader.replace("Bearer ", "");
  const session = verifySession(token);
  if (!session) {
    return NextResponse.json({ error: "请先登录" }, { status: 401 });
  }

  const { action, service } = await req.json();

  if (action === "reset_circuit" && service) {
    resetCircuit(service as ServiceName);
    return NextResponse.json({ success: true });
  }

  if (action === "reset_stats") {
    resetShieldStats();
    return NextResponse.json({ success: true });
  }

  return NextResponse.json({ error: "未知操作" }, { status: 400 });
}
