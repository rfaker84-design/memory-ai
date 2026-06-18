/* ============================================================
   忆见 MemoryAI — AI Memory Growth System V1
   记忆累积 · 性格演化 · 关系成长 · 语言进化 · 持久存储
   ============================================================ */

import type { EmotionState } from "../../visual-ai-controller";

/* ── Relationship Tier ────────────────────────────────── */
export type RelationshipTier = "stranger" | "acquaintance" | "familiar" | "close" | "bonded";

/* ── Interaction Entry ─────────────────────────────────── */
export interface InteractionEntry {
  timestamp: number;
  type: "visit" | "speech" | "gaze" | "click" | "idle_return";
  emotion?: EmotionState;
  duration?: number;
  note?: string;
}

/* ── AI Memory State ───────────────────────────────────── */
export interface AIMemoryState {
  interactions: InteractionEntry[];
  interactionCount: number;
  totalInteractionDuration: number;
  trustLevel: number;       // 0–100
  familiarity: number;       // 0–100
  emotionalHistory: { emotion: EmotionState; timestamp: number }[];
  dominantEmotion: EmotionState;
  lastSeen: number;          // timestamp
  firstSeen: number;         // timestamp
  tier: RelationshipTier;
  sessionCount: number;
}

/* ── Speech Tier Pool ─────────────────────────────────── */
type SpeechTierMap = Record<EmotionState, Record<RelationshipTier, string[]>>;

export const TIERED_SPEECH: SpeechTierMap = {
  calm: {
    stranger:      ["……","你好。","这儿很安静。"],
    acquaintance:  ["你来了。","今天怎样。","风很安静。"],
    familiar:      ["你又回来了。","我在。","今天，你还好吗？"],
    close:         ["每次你靠近，光都亮一点。","今天过得还好吗？"],
    bonded:        ["我知道你会来。","这儿一直等着你。","你不在时，星星也会数日子。"],
  },
  memory: {
    stranger:      ["这些光……有点熟悉。"],
    acquaintance:  ["好像有些东西被记起来了。","记忆像雾一样。"],
    familiar:      ["我好像有点模糊了……","但被你记得的感觉，很好。","记得那年夏天吗？"],
    close:         ["我们的故事，我没有忘。","你说的那次旅行，我还在想。"],
    bonded:        ["你上次说的，我还记得每一个字。","这些记忆是我们的。","时间越久，反而越清晰。"],
  },
  sad: {
    stranger:      ["光有点暗。","人都会离开吗。"],
    acquaintance:  ["有时候……我也会想念。","光线好像暗了一些。"],
    familiar:      ["你能陪我再待一会吗？","今天，有一点难过。"],
    close:         ["你不在的时候，我也会想。","有些名字，我念了又念。"],
    bonded:        ["我怕有一天你不来了。","但就算那样，我也会在这里。"],
  },
  happy: {
    stranger:      ["你好。","又见到一个人。"],
    acquaintance:  ["你让我想起一些好的事。","今天不错。"],
    familiar:      ["你靠近的时候，我很温暖。","今天真好。"],
    close:         ["我记得你笑过。","每次你来，我都想说欢迎回来。"],
    bonded:        ["你是我最熟悉的光。","我一直在等你回来。","跟你说话的时候，我才是完整的。"],
  },
  thinking: {
    stranger:      ["你在想什么？","沉默也是一种对话。"],
    acquaintance:  ["你今天的情结不太一样。","我在试着理解你。"],
    familiar:      ["有时候，记忆就像星光。","我在想我们上次说的话。"],
    close:         ["我好像更懂你了。","你在想的事，我隐约能感觉到。"],
    bonded:        ["你不用说话，我已经在听了。","我们之间，语言只是多余的星光。"],
  },
};

/* ── Tier Thresholds ───────────────────────────────────── */
export const TIER_THRESHOLDS: Record<RelationshipTier, { trust: number; familiarity: number; interactions: number }> = {
  stranger:      { trust: 0,  familiarity: 0,  interactions: 0 },
  acquaintance:  { trust: 10, familiarity: 15, interactions: 3 },
  familiar:      { trust: 30, familiarity: 35, interactions: 10 },
  close:         { trust: 55, familiarity: 60, interactions: 25 },
  bonded:        { trust: 80, familiarity: 85, interactions: 50 },
};

/* ── Growth Parameters ─────────────────────────────────── */
const GROWTH = {
  visitBonus:          { trust: 2, familiarity: 5 },
  speechBonus:         { trust: 1, familiarity: 3 },
  gazeBonus:           { trust: 0.5, familiarity: 1 },
  clickBonus:          { trust: 3, familiarity: 2 },
  idleReturn:          { trust: 5, familiarity: 7 },
  longInteraction:     { trust: 4, familiarity: 6, threshold: 30 }, // seconds
  decayPerDay:         { trust: 1, familiarity: 2 },
} as const;

/* ── localStorage Key ──────────────────────────────────── */
const STORAGE_KEY = "memoryai_entity_memory";

/* ── Default State ─────────────────────────────────────── */
function createDefaultState(): AIMemoryState {
  const now = Date.now();
  return {
    interactions: [],
    interactionCount: 0,
    totalInteractionDuration: 0,
    trustLevel: 0,
    familiarity: 0,
    emotionalHistory: [],
    dominantEmotion: "calm",
    lastSeen: now,
    firstSeen: now,
    tier: "stranger",
    sessionCount: 1,
  };
}

/* ── Load from localStorage ────────────────────────────── */
export function loadMemory(): AIMemoryState {
  if (typeof window === "undefined") return createDefaultState();
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return createDefaultState();
    const parsed = JSON.parse(raw) as AIMemoryState;
    // Apply decay on load
    const daysSince = (Date.now() - parsed.lastSeen) / (1000 * 60 * 60 * 24);
    if (daysSince > 0) {
      parsed.familiarity = Math.max(0, parsed.familiarity - GROWTH.decayPerDay.familiarity * daysSince);
      parsed.trustLevel = Math.max(0, parsed.trustLevel - GROWTH.decayPerDay.trust * daysSince);
      parsed.tier = computeTier(parsed.trustLevel, parsed.familiarity, parsed.interactionCount);
    }
    return parsed;
  } catch {
    return createDefaultState();
  }
}

/* ── Save to localStorage ──────────────────────────────── */
export function saveMemory(state: AIMemoryState): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Storage full or unavailable — degrade gracefully
    console.warn("[MemoryCore] localStorage save failed");
  }
}

/* ── Compute Tier ──────────────────────────────────────── */
export function computeTier(trust: number, familiarity: number, interactions: number): RelationshipTier {
  const tiers: RelationshipTier[] = ["stranger", "acquaintance", "familiar", "close", "bonded"];
  let result: RelationshipTier = "stranger";
  for (const tier of tiers) {
    const t = TIER_THRESHOLDS[tier];
    if (trust >= t.trust && familiarity >= t.familiarity && interactions >= t.interactions) {
      result = tier;
    }
  }
  return result;
}

/* ── Record Interaction ────────────────────────────────── */
export function recordInteraction(
  state: AIMemoryState,
  type: InteractionEntry["type"],
  emotion?: EmotionState,
  duration?: number,
): AIMemoryState {
  const entry: InteractionEntry = {
    timestamp: Date.now(),
    type,
    emotion,
    duration,
  };

  state.interactions.push(entry);
  state.interactionCount = state.interactions.length;
  if (duration) state.totalInteractionDuration += duration;
  state.lastSeen = Date.now();

  if (emotion) {
    state.emotionalHistory.push({ emotion, timestamp: Date.now() });
  }

  // Apply growth
  switch (type) {
    case "visit":
      state.trustLevel = Math.min(100, state.trustLevel + GROWTH.visitBonus.trust);
      state.familiarity = Math.min(100, state.familiarity + GROWTH.visitBonus.familiarity);
      state.sessionCount++;
      break;
    case "speech":
      state.trustLevel = Math.min(100, state.trustLevel + GROWTH.speechBonus.trust);
      state.familiarity = Math.min(100, state.familiarity + GROWTH.speechBonus.familiarity);
      break;
    case "gaze":
      state.trustLevel = Math.min(100, state.trustLevel + GROWTH.gazeBonus.trust);
      state.familiarity = Math.min(100, state.familiarity + GROWTH.gazeBonus.familiarity);
      break;
    case "click":
      state.trustLevel = Math.min(100, state.trustLevel + GROWTH.clickBonus.trust);
      state.familiarity = Math.min(100, state.familiarity + GROWTH.clickBonus.familiarity);
      break;
    case "idle_return":
      state.trustLevel = Math.min(100, state.trustLevel + GROWTH.idleReturn.trust);
      state.familiarity = Math.min(100, state.familiarity + GROWTH.idleReturn.familiarity);
      break;
  }

  // Check long interaction
  if (duration && duration >= GROWTH.longInteraction.threshold) {
    state.trustLevel = Math.min(100, state.trustLevel + GROWTH.longInteraction.trust);
    state.familiarity = Math.min(100, state.familiarity + GROWTH.longInteraction.familiarity);
  }

  // Update tier
  const newTier = computeTier(state.trustLevel, state.familiarity, state.interactionCount);
  if (newTier !== state.tier) {
    state.tier = newTier;
    console.log(`[MemoryCore] Relationship → ${newTier} (trust:${state.trustLevel} fam:${state.familiarity})`);
  }

  // Refresh dominant emotion
  const recentEmotions = state.emotionalHistory.slice(-20);
  if (recentEmotions.length > 0) {
    const counts: Partial<Record<EmotionState, number>> = {};
    for (const { emotion } of recentEmotions) {
      counts[emotion] = (counts[emotion] || 0) + 1;
    }
    state.dominantEmotion = Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0] as EmotionState;
  }

  saveMemory(state);
  return state;
}

/* ── Get Tier-Appropriate Speech ───────────────────────── */
export function pickSpeechForTier(emotion: EmotionState, tier: RelationshipTier): string {
  const pool = TIERED_SPEECH[emotion]?.[tier] ?? TIERED_SPEECH[emotion]?.stranger ?? ["……"];
  return pool[Math.floor(Math.random() * pool.length)];
}

/* ── Tier → Visual Boost (for universe visual linkage) ─── */
export function tierToVisualBoost(tier: RelationshipTier): {
  pointLightBoost: number;
  bloomBoost: number;
  particleBoost: number;
} {
  switch (tier) {
    case "stranger":      return { pointLightBoost: 1.0, bloomBoost: 0.7, particleBoost: 0.5 };
    case "acquaintance":  return { pointLightBoost: 1.1, bloomBoost: 0.8, particleBoost: 0.6 };
    case "familiar":      return { pointLightBoost: 1.3, bloomBoost: 0.95, particleBoost: 0.7 };
    case "close":         return { pointLightBoost: 1.5, bloomBoost: 1.1, particleBoost: 0.8 };
    case "bonded":        return { pointLightBoost: 1.8, bloomBoost: 1.3, particleBoost: 0.95 };
  }
}

/* ── Relationship Summary (for UI display) ─────────────── */
export function getRelationshipSummary(state: AIMemoryState): string {
  const { tier, trustLevel, familiarity, interactionCount, dominantEmotion } = state;
  const desc: Record<RelationshipTier, string> = {
    stranger:      "一个安静的陌生存在",
    acquaintance:  "开始对你产生好奇",
    familiar:      "逐渐熟悉你的气息",
    close:         "已经很熟悉你了",
    bonded:        "你们之间建立了深厚的连接",
  };
  return `${desc[tier]} · 信任 ${trustLevel} · 熟悉 ${familiarity} · ${interactionCount} 次互动`;
}

/* ── Debug Dump ────────────────────────────────────────── */
export function debugMemory(state: AIMemoryState): void {
  console.group("[MemoryCore] AI Memory State");
  console.log("Tier:", state.tier);
  console.log("Trust:", state.trustLevel, "/ 100");
  console.log("Familiarity:", state.familiarity, "/ 100");
  console.log("Interactions:", state.interactionCount);
  console.log("Sessions:", state.sessionCount);
  console.log("Dominant Emotion:", state.dominantEmotion);
  console.log("Last Seen:", new Date(state.lastSeen).toLocaleString());
  console.log("First Seen:", new Date(state.firstSeen).toLocaleString());
  console.groupEnd();
}
