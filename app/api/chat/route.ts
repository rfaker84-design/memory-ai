// ╔══════════════════════════════════════════════════════════════╗
// ║  Chat API V3 — 商业SaaS 数字人系统 (主入口)                ║
// ║  POST /api/chat  — 用户对话，全链路SaaS调度                ║
// ║  GET  /api/chat  — 系统状态面板（成本/租户/队列）          ║
// ╚══════════════════════════════════════════════════════════════╝

import { NextRequest, NextResponse } from "next/server";
import { orchestrate, type OrchestratorResponse } from "../../../src/lib/orchestrator";
import { checkRateLimitMem } from "../../../src/lib/rateLimiter";
import { getUserDailyCost, getUserTier } from "../../../src/lib/costManager";
import { getPlan } from "../../../src/lib/billing";
import { getSystemStats } from "../../../src/lib/costCenter";
import { getQueueStats } from "../../../src/lib/queue";
import { getTenantStats, getUserTenant } from "../../../src/lib/tenantManager";
import { getSessionStats } from "../../../src/lib/sessionManager";
import { verifySession, getUserProfile } from "../../../src/lib/auth";
import { getCacheStats } from "../../../src/lib/llmCache";
import { getTTSCacheStats } from "../../../src/lib/ttsCache";
import { getAvatarStats } from "../../../src/lib/avatarManager";

// ═══════════════════════════════════════════════════════════════
// POST — 核心对话接口 (Orchestrator 全链路)
// ═══════════════════════════════════════════════════════════════
export async function POST(req: NextRequest) {
  const startTime = Date.now();

  try {
    const body = await req.json();
    const { userId, memoryId, name, relationship, lifeStory, history, userMessage } = body;

    // ── 参数校验 ──────────────────────────────────────────
    if (!userId || !memoryId || !name || !userMessage) {
      return NextResponse.json(
        { error: "缺少必填字段: userId, memoryId, name, userMessage" },
        { status: 400 },
      );
    }

    // ── V4: 身份验证 ────────────────────────────────────
    const authHeader = req.headers.get("authorization") || "";
    const sessionToken = authHeader.replace("Bearer ", "");
    const session = sessionToken ? verifySession(sessionToken) : null;
    if (sessionToken && !session) {
      return NextResponse.json(
        { error: "登录已过期，请重新登录", text: null, emotion: "calm" },
        { status: 401 },
      );
    }

    // ── 限流检查 ──────────────────────────────────────────
    const effectiveUserId = session ? session.userId : userId;
    const rateLimit = checkRateLimitMem(effectiveUserId);
    if (!rateLimit.allowed) {
      return NextResponse.json(
        {
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

    // ── Orchestrator 调度 ─────────────────────────────────
    const result: OrchestratorResponse = await orchestrate({
      userId: effectiveUserId,
      memoryId,
      name,
      relationship: relationship || null,
      lifeStory: lifeStory || null,
      userMessage,
      history: history || [],
      sessionToken: sessionToken || undefined,
    });

    // ── 返回完整SaaS响应 ──────────────────────────────────
    return NextResponse.json({
      // 核心内容
      text: result.text,
      emotion: result.emotion,
      audioUrl: result.audioUrl,
      avatarUrl: result.avatarUrl,

      // 性能
      latencyMs: Date.now() - startTime,

      // SaaS元数据
      cost: result.cost,
      cacheHit: result.cacheHit,
      modelUsed: result.modelUsed,
      tier: result.tier,
      tenantBudget: result.tenantBudget,

      // V4 商业闭环
      authenticated: result.authenticated,
      quota: result.quota,
      upsell: result.upsell,

      // V6 增长系统
      stickiness: result.stickiness,
      ltv: result.ltv,
      personalization: result.personalization,

      // V7 病毒传播
      shareTrigger: result.shareTrigger,
      shareContent: result.shareContent,

      // V7 收入引擎
      userProgress: result.userProgress,
      emotionPaywall: result.emotionPaywall,
      conversionProfile: result.conversionProfile,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "未知错误";
    console.error("[Chat API V3]", msg);
    return NextResponse.json(
      {
        error: msg,
        text: "我今天需要休息一下，改天再聊吧。",
        emotion: "calm" as const,
        latencyMs: Date.now() - startTime,
      },
      { status: 500 },
    );
  }
}

// ═══════════════════════════════════════════════════════════════
// GET — 系统状态面板 (运维/计费/成本/租户 全景视图)
// ═══════════════════════════════════════════════════════════════
export async function GET(req: NextRequest) {
  const userId = req.nextUrl.searchParams.get("userId");
  const tier = userId ? getUserTier(userId) : null;
  const plan = tier ? getPlan(tier) : null;
  const daily = userId ? getUserDailyCost(userId) : null;
  const tenant = userId ? getUserTenant(userId) : null;

  return NextResponse.json({
    // 系统全局
    system: getSystemStats(),
    queue: getQueueStats(),
    tenants: getTenantStats(),
    sessions: getSessionStats(),
    cache: {
      llm: getCacheStats(),
      tts: getTTSCacheStats(),
      avatar: getAvatarStats(),
    },

    // 当前用户（如有）
    ...(userId && tier && plan && daily
      ? {
          user: {
            userId,
            tier,
            plan: plan.name,
            monthlyPriceYuan: plan.monthlyPrice / 100,
            today: {
              llmCalls: daily.llmCalls,
              ttsCalls: daily.ttsCalls,
              avatarCalls: daily.avatarCalls,
              totalCostCents: daily.totalCost,
              limits: {
                llmPerDay: plan.llmPerDay,
                ttsPerDay: plan.ttsPerDay,
                avatarPerDay: plan.avatarPerDay,
              },
            },
            tenant: tenant
              ? {
                  id: tenant.tenantId,
                  name: tenant.name,
                  type: tenant.type,
                  tier: tenant.tier,
                  budgetUsed: tenant.usedThisMonth,
                  monthlyBudget: tenant.monthlyBudget,
                }
              : null,
          },
        }
      : {}),
  });
}
