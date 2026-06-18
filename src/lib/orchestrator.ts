// orchestrator.ts — V3 商业SaaS调度中心
// 集成: 租户 → 计费 → 成本中心 → 模型路由 → 队列 → 缓存 → AI调用

import { callVolcLLM, type Emotion } from "./volc";
import { updateEmotion } from "./emotionEngine";
import { generateSpeech } from "./tts";
import { getOrGenerateAvatar } from "./avatarManager";
import { cacheGet, cacheSet } from "./redis";
import { getUserTier, checkLimit, recordCost, type UserTier } from "./costManager";
import { getPlan, recordBilling } from "./billing";
import { evaluateCost, recordSystemCost, type CostDecision } from "./costCenter";
import { selectModel, incrementLoad, decrementLoad, type ModelSelection } from "./modelRouter";
import { enqueueTask, canAcceptTask, getBackpressureLevel } from "./queue";
import { admitRequest, releaseRequest, isServiceAvailable } from "./overloadShield";
import { withCircuitBreaker } from "./circuitBreaker";
import { logEmotion, getPersonalizationContext } from "./memoryLoop";
import { recordInteraction } from "./emotionalStickiness";
import { trackGrowthEvent } from "./growth";
import { trackAnalytics } from "./analytics";
import { calculateLTV } from "./ltv";
import { evaluateShareTrigger } from "./viral";
import { generateShareContent, generateViralTitle } from "./shareContent";
import { getConversionProfile, getConversionTiming } from "./conversion";
import { getEmotionPaywall } from "./emotionPaywall";
import { triggerEngagementLoop } from "./engagementLoop";
import { addXP, getUserProgress } from "./userProgress";
import { getUserTenant, recordTenantCost } from "./tenantManager";
import { updateSummary } from "./sessionManager";
import { verifySession, getUserProfile } from "./auth";
import { checkQuota, recordUsage, shouldUpsell, type QuotaCheck } from "./quota";
import { PLAN_PRICING } from "./payment";

export { type Emotion } from "./volc";

export interface OrchestratorResponse {
  text: string;
  emotion: Emotion;
  audioUrl: string | null;
  avatarUrl: string | null;
  cost: { estimated: number; actual: number; services: string[] };
  cacheHit: { llm: boolean; tts: boolean; avatar: boolean };
  modelUsed: { llm: string; tts: string; avatar: string };
  tier: UserTier;
  tenantBudget: { remaining: number; usedPercent: number } | null;
  // V4 商业闭环
  quota: { llm: QuotaCheck; tts: QuotaCheck; avatar: QuotaCheck };
  upsell: { shouldUpsell: boolean; reason: string; targetTier: string } | null;
  authenticated: boolean;
  // V6 增长系统
  stickiness: { level: string; score: number; churnRisk: number };
  ltv: { estimated: number; recommendedTier: string; predictedConversion: number };
  personalization: { tone: string; familiarity: string; isReturning: boolean };
  // V7 病毒传播
  shareTrigger: { shouldTrigger: boolean; reason: string; timing: string };
  shareContent: { title: string; subtitle: string; quote: string; hashtags: string[]; cta: string; emotion: string; format: string };
  // V7 收入引擎
  userProgress: { level: number; xp: number; title: string; nextUnlock: string };
  emotionPaywall: { shouldTrigger: boolean; title: string; description: string; cta: string } | null;
  conversionProfile: { stage: string; probability: number; urgency: string };
}

// ─── LLM缓存键 ──────────────────────────────────────────────
function llmKey(memoryId: string, msg: string): string {
  return "llm:" + memoryId + ":" + msg.trim().toLowerCase().replace(/\s+/g, " ").slice(0, 80);
}
function ttsKey(text: string): string {
  return "tts:" + text.trim().slice(0, 120);
}


// ─── 开发环境检测 ───────────────────────────────────────────
function isDevMode(): boolean {
  return !process.env.VOLC_API_KEY && !process.env.OPENAI_API_KEY && !process.env.DEEPSEEK_API_KEY;
}

function devResponse(userMessage: string, name: string): { text: string; emotion: Emotion } {
  const devReplies = [
    { text: "我在。", emotion: "calm" as Emotion },
    { text: "嗯，我听着呢。", emotion: "calm" as Emotion },
    { text: "我也想你了。", emotion: "warm" as Emotion },
    { text: "记得常来看看我。", emotion: "nostalgic" as Emotion },
    { text: "我一直在。", emotion: "calm" as Emotion },
  ];
  const idx = Math.abs(hashCode(userMessage)) % devReplies.length;
  return devReplies[idx];
}

function hashCode(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) { h = ((h << 5) - h) + s.charCodeAt(i); h |= 0; }
  return Math.abs(h);
}
// ─── 主入口 ─────────────────────────────────────────────────
export async function orchestrate(params: {
  userId: string;
  memoryId: string;
  name: string;
  relationship: string | null;
  lifeStory: string | null;
  userMessage: string;
  history: Array<{ role: "user" | "assistant"; content: string }>;
  sessionToken?: string;
}): Promise<OrchestratorResponse> {
  const { userId, memoryId, name, relationship, lifeStory, userMessage, history } = params;

  // V4: 身份验证
  let authenticated = false;
  let effectiveUserId = userId;
  let effectiveTier: UserTier = "free";

  if (params.sessionToken) {
    const session = verifySession(params.sessionToken);
    if (session) {
      authenticated = true;
      effectiveUserId = session.userId;
      effectiveTier = session.tier as UserTier;
    }
  }

  const tier = authenticated ? effectiveTier : getUserTier(userId);
  const plan = getPlan(tier);
  const tenant = getUserTenant(effectiveUserId);

  // ═══════════════════════════════════════════════════════════
  // 0. 成本评估
  // ═══════════════════════════════════════════════════════════
  const costDecision = evaluateCost(userId, ["llm", "tts", "avatar"]);
  if (costDecision.downgradeLevel === "deny") {
    return denyResponse(tier, costDecision);
  }

  // V5: Overload shield
  const admission = admitRequest();
  if (!admission.admitted) {
    return denyResponse(tier, costDecision, admission.reason);
  }

  incrementLoad();

  // ═══════════════════════════════════════════════════════════
  // 1. 模型选择
  // ═══════════════════════════════════════════════════════════
  const model = selectModel(tier, costDecision.downgradeLevel, 0);

  try {
    // 通过队列执行核心逻辑
    const result = await enqueueTask(userId, plan.priority, async () => {
      return executeAIPipeline({
        effectiveUserId, authenticated,
        userId, memoryId, name, relationship, lifeStory,
        userMessage, history, tier, plan, model, costDecision, tenant,
      });
    });


    return result;
  } catch {
    console.error("[orchestrator] 核心管道异常，返回兜底响应");
    return fallbackResponse();
  } finally {
    decrementLoad();
    releaseRequest();
  }
}

// ─── AI管道执行 ─────────────────────────────────────────────
async function executeAIPipeline(params: {
  userId: string;
  effectiveUserId: string;
  authenticated: boolean;
  memoryId: string;
  name: string;
  relationship: string | null;
  lifeStory: string | null;
  userMessage: string;
  history: Array<{ role: "user" | "assistant"; content: string }>;
  tier: UserTier;
  plan: ReturnType<typeof getPlan>;
  model: ModelSelection;
  costDecision: CostDecision;
  tenant: ReturnType<typeof getUserTenant>;
}): Promise<OrchestratorResponse> {
  const { userId, effectiveUserId, authenticated, memoryId, name, relationship, lifeStory, userMessage, history, tier, model, costDecision, tenant } = params;
  const isNight = new Date().getHours() >= 22 || new Date().getHours() < 6;
  const cacheHit = { llm: false, tts: false, avatar: false };
  const servicesUsed: string[] = [];

  // ═══════════════════════════════════════════════════════════
  // LLM
  // ═══════════════════════════════════════════════════════════
  let text: string;
  let emotion: Emotion;

  if (model.useCache || model.llmModel === "cache") {
    // 仅缓存模式
    const cached = await cacheGet(llmKey(memoryId, userMessage));
    if (cached) {
        let parsed: { text: string; emotion: Emotion };
        try {
          parsed = JSON.parse(cached);
        } catch {
          parsed = { text: "我在这里。", emotion: "calm" as Emotion };
        }
      text = parsed.text;
      emotion = parsed.emotion;
      cacheHit.llm = true;
    } else {
      text = "我今天需要休息一下，改天再聊吧。";
      emotion = "calm";
    }
  } else {
    const llmLimit = checkLimit(userId, "llm");
    if (!llmLimit.allowed) {
      text = "我今天说了太多话，需要休息一下。";
      emotion = "calm";
    } else {
      const cachedLLM = await cacheGet(llmKey(memoryId, userMessage));
      if (cachedLLM) {
        let parsed: { text: string; emotion: Emotion };
        try { parsed = JSON.parse(cachedLLM); } catch {
          parsed = { text: "我在这里。", emotion: "calm" as Emotion };
        }
        text = parsed.text;
        emotion = parsed.emotion;
        cacheHit.llm = true;
      } else {
        let result: { text: string; emotion: Emotion };
        if (isDevMode()) {
          result = devResponse(userMessage, name);
        } else {
          const llmCb = await withCircuitBreaker(
            "llm",
            () => callVolcLLM({ name, relationship, lifeStory }, userMessage, history),
            () => ({ text: "我今天有点累，改天再聊吧。", emotion: "calm" as Emotion }),
          );
          result = llmCb.result;
        }
        text = result.text;
        emotion = result.emotion;
        updateEmotion(emotion, 0.6, "chat");

        await cacheSet(llmKey(memoryId, userMessage), JSON.stringify({ text, emotion }), 600);
        recordCost(userId, "llm");
        recordBilling(userId, "llm");
        recordSystemCost(2);
        if (tenant) recordTenantCost(tenant.tenantId, 2);
        servicesUsed.push("llm");
      }
    }
  }

  // ═══════════════════════════════════════════════════════════
  // TTS
  // ═══════════════════════════════════════════════════════════
  let audioUrl: string | null = null;
  const ttsLimit = checkLimit(userId, "tts");

  if (ttsLimit.allowed && model.ttsQuality !== "none") {
    const cachedTTS = await cacheGet(ttsKey(text));
    if (cachedTTS) {
      audioUrl = "data:audio/mp3;base64," + cachedTTS;
      cacheHit.tts = true;
    } else if (!costDecision.downgradeLevel.includes("cache")) {
      try {
        const ttsCb = await withCircuitBreaker(
          "tts",
          () => generateSpeech(text, emotion),
          () => ({ audioBase64: null, audioUrl: null, provider: "volc" as const, cached: false, fallback: true }),
        );
        const ttsResult = ttsCb.result;
        audioUrl = ttsResult.audioUrl;
        if (ttsResult.audioBase64) {
          await cacheSet(ttsKey(text), ttsResult.audioBase64, 3600);
        }
        recordCost(userId, "tts");
        recordBilling(userId, "tts");
        recordSystemCost(1);
        if (tenant) recordTenantCost(tenant.tenantId, 1);
        servicesUsed.push("tts");
      } catch { /* non-fatal */ }
    }
  }

  // ═══════════════════════════════════════════════════════════
  // Avatar
  // ═══════════════════════════════════════════════════════════
  let avatarUrl: string | null = null;
  if (model.avatarType !== "none") {
    try {
      // getOrGenerateAvatar 已内置降级（即梦AI → Supabase → 静态SVG），永不返回null
      avatarUrl = await getOrGenerateAvatar(memoryId, emotion, name);
      cacheHit.avatar = true;
    } catch {
      // 极端兜底：getOrGenerateAvatar 已内置降级，此catch仅防意外
      console.warn("[orchestrator] avatar 异常，跳过");
    }
  }
  // ═══════════════════════════════════════════════════════════
  // Session
  // ═══════════════════════════════════════════════════════════
  updateSummary(userId, memoryId, userMessage, text);

  const tenantBudget = tenant
    ? { remaining: tenant.monthlyBudget - tenant.usedThisMonth, usedPercent: (tenant.usedThisMonth / Math.max(tenant.monthlyBudget, 1)) * 100 }
    : null;

  // V4: Quota snapshot
  const quota = {
    llm: checkQuota(effectiveUserId, tier, "llm"),
    tts: checkQuota(effectiveUserId, tier, "tts"),
    avatar: checkQuota(effectiveUserId, tier, "avatar"),
  };

  // V4: Upsell check
  const upsell = shouldUpsell(effectiveUserId, tier);

  return {
    text,
    emotion,
    audioUrl,
    avatarUrl,
    cost: {
      estimated: costDecision.estimatedCost,
      actual: costDecision.actualCost,
      services: servicesUsed,
    },
    cacheHit,
    modelUsed: {
      llm: model.llmModel,
      tts: model.ttsQuality,
      avatar: model.avatarType,
    },
    tier,
    tenantBudget,
    quota,
    upsell,
    authenticated,
    // V6 增长
    stickiness: (() => {
      const s = recordInteraction(effectiveUserId, {});
      return { level: s.level, score: s.score, churnRisk: s.churnRisk };
    })(),
    ltv: (() => {
      const l = calculateLTV(effectiveUserId);
      return { estimated: l.estimatedLTV, recommendedTier: l.recommendedTier, predictedConversion: l.predictedConversion };
    })(),
    personalization: (() => {
      const p = getPersonalizationContext(effectiveUserId, memoryId);
      return { tone: p.personality.responseTone, familiarity: p.familiarity, isReturning: p.isReturningUser };
    })(),
    // V7 分享触发
    shareTrigger: evaluateShareTrigger({
      userId: effectiveUserId,
      stickinessScore: Math.round(recordInteraction(effectiveUserId, {}).score),
      emotion,
      chatDepth: history.length + 1,
      isReturningUser: history.length > 0,
      lastShareDays: 7,
    }),
    shareContent: generateShareContent({ name, relationship, emotion, format: "card" }),
    // V7 收入引擎
    userProgress: (() => {
      const up = getUserProgress(effectiveUserId);
      return { level: up.level, xp: up.xp, title: up.title, nextUnlock: up.nextUnlock };
    })(),
    emotionPaywall: (() => {
      const ep = getEmotionPaywall({
        emotion, userMessage,
        stickiness: (recordInteraction(effectiveUserId, {}).level) as "new" | "curious" | "regular" | "attached" | "dependent",
        chatCount: history.length + 1,
        isNightSession: isNight,
        currentTier: tier,
        lastPaywallDays: 3,
      });
      return ep.shouldTrigger ? { shouldTrigger: true, title: ep.title, description: ep.description, cta: ep.cta } : null;
    })(),
    conversionProfile: (() => {
      const cp = getConversionProfile(effectiveUserId);
      return { stage: cp.stage, probability: cp.conversionProbability, urgency: cp.urgency };
    })(),
  };
}

// ─── 拒绝响应 ───────────────────────────────────────────────
function denyResponse(tier: UserTier, cost: CostDecision, reason?: string): OrchestratorResponse {
  const emptyQ = { allowed: false, service: "llm" as const, used: 0, limit: 0, remaining: 0, usagePercent: 100 };
  return {
    text: reason || "今天的服务时间到了，明天再来找我吧。",
    emotion: "calm",
    audioUrl: null,
    avatarUrl: null,
    cost: { estimated: cost.estimatedCost, actual: cost.actualCost, services: [] },
    cacheHit: { llm: false, tts: false, avatar: false },
    modelUsed: { llm: "none", tts: "none", avatar: "none" },
    tier,
    tenantBudget: null,
    quota: { llm: emptyQ, tts: emptyQ, avatar: emptyQ },
    upsell: null,
    authenticated: false,
    stickiness: { level: "new", score: 0, churnRisk: 1 },
    ltv: { estimated: 0, recommendedTier: "free", predictedConversion: 0 },
    personalization: { tone: "calm", familiarity: "new", isReturning: false },
    shareTrigger: { shouldTrigger: false, reason: "", timing: "immediate" },
    shareContent: { title: "", subtitle: "", quote: "", hashtags: [], cta: "", emotion: "calm", format: "card" },
    userProgress: { level: 1, xp: 0, title: "初次相遇", nextUnlock: "语音陪伴" },
    emotionPaywall: null,
    conversionProfile: { stage: "awareness", probability: 0, urgency: "low" },
  };
}

function fallbackResponse(): OrchestratorResponse {
  const emptyQ = { allowed: false, service: "llm" as const, used: 0, limit: 0, remaining: 0, usagePercent: 100 };
  return {
    text: "我在这里。",
    emotion: "calm",
    audioUrl: null,
    avatarUrl: null,
    cost: { estimated: 0, actual: 0, services: [] },
    cacheHit: { llm: false, tts: false, avatar: false },
    modelUsed: { llm: "fallback", tts: "fallback", avatar: "fallback" },
    tier: "free",
    tenantBudget: null,
    quota: { llm: emptyQ, tts: emptyQ, avatar: emptyQ },
    upsell: null,
    authenticated: false,
    stickiness: { level: "new", score: 0, churnRisk: 0 },
    ltv: { estimated: 0, recommendedTier: "free", predictedConversion: 0 },
    personalization: { tone: "calm", familiarity: "new", isReturning: false },
    shareTrigger: { shouldTrigger: false, reason: "", timing: "immediate" },
    shareContent: { title: "", subtitle: "", quote: "", hashtags: [], cta: "", emotion: "calm", format: "card" },
    userProgress: { level: 1, xp: 0, title: "初次相遇", nextUnlock: "语音陪伴" },
    emotionPaywall: null,
    conversionProfile: { stage: "awareness", probability: 0, urgency: "low" },
  };
}
