// Chat API V3 — 商业SaaS入口
// 必须走Orchestrator，返回完整计费信息
import { NextRequest, NextResponse } from "next/server";
import { orchestrate } from "../../../src/lib/orchestrator";
import { checkRateLimitMem } from "../../../src/lib/rateLimiter";
import { getUserDailyCost, getUserTier } from "../../../src/lib/costManager";
import { getPlan } from "../../../src/lib/billing";
import { getSystemStats } from "../../../src/lib/costCenter";
import { getQueueStats } from "../../../src/lib/queue";
import { getTenantStats, getUserTenant } from "../../../src/lib/tenantManager";

export async function POST(req: NextRequest) {
  const startTime = Date.now();

  try {
    const body = await req.json();
    const { userId, memoryId, name, relationship, lifeStory, history, userMessage } = body;

    if (!userId || !memoryId || !name || !userMessage) {
      return NextResponse.json(
        { success: false, error: "缺少必填字段: userId, memoryId, name, userMessage" },
        { status: 400 },
      );
    }

    // 限流
    const rateLimit = checkRateLimitMem(userId);
    if (!rateLimit.allowed) {
      return NextResponse.json(
        {
          success: false,
          text: "请稍等一下，我需要喘口气。",
          emotion: "calm",
          error: rateLimit.reason,
          retryAfterMs: rateLimit.resetMs,
        },
        {
          status: 429,
          headers: { "Retry-After": String(Math.ceil(rateLimit.resetMs / 1000)) },
        },
      );
    }

    // 通过Orchestrator
    const result = await orchestrate({
      userId, memoryId, name,
      relationship: relationship || null,
      lifeStory: lifeStory || null,
      userMessage,
      history: history || [],
    });

    return NextResponse.json({
      success: true,
      text: result.text,
      emotion: result.emotion,
      audioUrl: result.audioUrl,
      avatarUrl: result.avatarUrl,
      latency: Date.now() - startTime,
      cost: result.cost,
      cacheHit: result.cacheHit,
      modelUsed: result.modelUsed,
      tier: result.tier,
      tenantBudget: result.tenantBudget,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "未知错误";
    return NextResponse.json(
      { success: false, text: "我现在有点累，改天再聊吧。", emotion: "calm", error: msg },
      { status: 500 },
    );
  }
}

// ─── GET: 系统状态面板 ──────────────────────────────────────
export async function GET(req: NextRequest) {
  const userId = req.nextUrl.searchParams.get("userId");
  const tier = userId ? getUserTier(userId) : null;
  const plan = tier ? getPlan(tier) : null;
  const daily = userId ? getUserDailyCost(userId) : null;
  const tenant = userId ? getUserTenant(userId) : null;

  return NextResponse.json({
    system: getSystemStats(),
    queue: getQueueStats(),
    tenants: getTenantStats(),
    ...(userId && tier && plan && daily
      ? {
          user: {
            userId,
            tier,
            plan: plan.name,
            monthlyPrice: plan.monthlyPrice,
            today: {
              llmCalls: daily.llmCalls,
              ttsCalls: daily.ttsCalls,
              totalCost: daily.totalCost,
              limits: {
                llm: plan.llmPerDay,
                tts: plan.ttsPerDay,
                avatar: plan.avatarPerDay,
              },
            },
            tenant: tenant
              ? { id: tenant.tenantId, type: tenant.type, budgetUsed: tenant.usedThisMonth }
              : null,
          },
        }
      : {}),
  });
}
