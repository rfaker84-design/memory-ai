// ============================================================
// V6 数字生命体 — 类型定义 & 演化规则
// ============================================================

// --- 核心向量 ---
export interface PersonalityVector {
  warmth: number;       // 0-1 温暖度
  openness: number;     // 0-1 开放度
  stability: number;    // 0-1 情绪稳定性
  nostalgia: number;    // 0-1 怀旧倾向
  humor: number;        // 0-1 幽默感
  gentleness: number;   // 0-1 温柔度
}

// --- 情绪状态 ---
export interface EmotionState {
  valence: number;      // -1(消极) ~ +1(积极)
  arousal: number;      // 0(平静) ~ 1(活跃)
  dominant: EntityMood;
  lastShift: number;    // timestamp
}

export type EntityMood = "calm" | "warm" | "melancholy" | "curious" | "distant" | "bright" | "sleeping";

// --- 记忆图谱 ---
export interface MemoryGraph {
  strongMemories: MemoryNode[];
  fadingMemories: MemoryNode[];
  coreMemory: string | null;     // 最核心的记忆
  lastReinforced: number;        // timestamp
}

export interface MemoryNode {
  id: string;
  content: string;
  strength: number;    // 0-1, decays over time
  emotion: string;
  reinforcedCount: number;
  createdAt: number;
}

// --- 关系模型 ---
export interface RelationshipModel {
  userAttachmentLevel: number;    // 0-1
  interactionCount: number;
  lastInteractionTime: number;
  deepConversationCount: number;
  attachmentTrend: "growing" | "stable" | "fading";
}

// --- 生命周期状态 ---
export type LifecyclePhase = "awakening" | "present" | "reflecting" | "sleeping" | "dormant";

// --- 完整实体状态 ---
export interface EntityState {
  memoryId: string;
  memoryName: string;
  personality: PersonalityVector;
  emotion: EmotionState;
  memoryGraph: MemoryGraph;
  relationship: RelationshipModel;
  lifecycle: LifecyclePhase;
  presenceIntensity: number;    // 0-1, 影响视觉效果
  lastUpdated: number;
  version: number;              // 单调递增
}

// --- 演化日志 ---
export interface EvolutionEvent {
  timestamp: number;
  type: "visit" | "chat" | "idle" | "deep_conversation" | "sleep" | "awaken";
  delta: Partial<EmotionState>;
  description: string;
}

// ============================================================
// 演化规则引擎
// ============================================================

export class EvolutionEngine {
  /** 计算自上次交互以来的时间衰减 */
  static decay(state: EntityState, now: number): EntityState {
    const hoursSinceLast = (now - (state.relationship.lastInteractionTime || now)) / 3600000;
    if (hoursSinceLast < 1) return state; // 1小时内不变

    const decayRate = Math.min(hoursSinceLast / 168, 1); // 7天完全衰减
    const s = { ...state, emotion: { ...state.emotion }, relationship: { ...state.relationship } };

    // 情绪衰减
    s.emotion.valence = clamp(s.emotion.valence - decayRate * 0.3, -1, 1);
    s.emotion.arousal = clamp(s.emotion.arousal - decayRate * 0.5, 0, 1);
    s.presenceIntensity = clamp(s.presenceIntensity - decayRate * 0.6, 0.1, 1);

    // 关系衰减
    s.relationship.userAttachmentLevel = clamp(s.relationship.userAttachmentLevel - decayRate * 0.15, 0, 1);
    s.relationship.attachmentTrend =
      decayRate > 0.5 ? "fading" : decayRate > 0.2 ? "stable" : "growing";

    // 生命周期
    if (decayRate > 0.8) s.lifecycle = "dormant";
    else if (decayRate > 0.4) s.lifecycle = "sleeping";
    else if (decayRate > 0.1) s.lifecycle = "reflecting";

    // 记忆衰减
    s.memoryGraph = { ...state.memoryGraph,
      fadingMemories: [...state.memoryGraph.fadingMemories],
      strongMemories: [...state.memoryGraph.strongMemories],
    };
    s.memoryGraph.strongMemories = s.memoryGraph.strongMemories.map(m => ({
      ...m, strength: clamp(m.strength - decayRate * 0.05, 0.1, 1),
    }));

    s.lastUpdated = now;
    s.version++;
    return s;
  }

  /** 访问唤醒 */
  static onVisit(state: EntityState, now: number): EntityState {
    const s = this.decay(state, now);
    s.emotion.arousal = clamp(s.emotion.arousal + 0.25, 0, 1);
    s.emotion.valence = clamp(s.emotion.valence + 0.1, -1, 1);
    s.presenceIntensity = clamp(s.presenceIntensity + 0.3, 0.1, 1);
    s.relationship.interactionCount++;
    s.relationship.lastInteractionTime = now;
    s.relationship.userAttachmentLevel = clamp(s.relationship.userAttachmentLevel + 0.02, 0, 1);
    s.lifecycle = "awakening";
    s.lastUpdated = now;
    s.version++;
    return s;
  }

  /** 深度对话 */
  static onDeepConversation(state: EntityState, now: number): EntityState {
    const s = { ...state, emotion: { ...state.emotion }, relationship: { ...state.relationship } };
    s.emotion.valence = clamp(s.emotion.valence + 0.2, -1, 1);
    s.emotion.arousal = clamp(s.emotion.arousal + 0.15, 0, 1);
    s.relationship.deepConversationCount++;
    s.relationship.userAttachmentLevel = clamp(s.relationship.userAttachmentLevel + 0.05, 0, 1);
    s.relationship.attachmentTrend = "growing";
    s.presenceIntensity = clamp(s.presenceIntensity + 0.15, 0.1, 1);
    s.lifecycle = "present";
    s.lastUpdated = now;
    s.version++;
    return s;
  }

  /** 用户空闲 */
  static onUserIdle(state: EntityState, now: number): EntityState {
    const s = { ...state, emotion: { ...state.emotion } };
    s.emotion.arousal = clamp(s.emotion.arousal - 0.05, 0, 1);
    s.lifecycle = "reflecting";
    s.presenceIntensity = clamp(s.presenceIntensity - 0.02, 0.15, 1);
    s.lastUpdated = now;
    s.version++;
    return s;
  }

  /** 计算当前情绪标签 */
  static computeMood(state: EntityState): EntityMood {
    const { valence, arousal } = state.emotion;
    if (state.lifecycle === "dormant") return "sleeping";
    if (state.lifecycle === "sleeping") return "sleeping";
    if (arousal < 0.15) return "distant";
    if (valence > 0.4 && arousal > 0.5) return "bright";
    if (valence > 0.2) return "warm";
    if (valence < -0.2 && arousal > 0.3) return "melancholy";
    if (valence < -0.1) return "distant";
    if (arousal > 0.5) return "curious";
    return "calm";
  }
}

// ============================================================
// 情绪 → 视觉参数映射
// ============================================================

export interface EntityVisuals {
  bgColor: string;
  glowColor: string;
  particleColor: string;
  particleDensity: number;
  breatheFrequency: number;
  breatheAmplitude: number;
  blur: number;
  brightness: number;
}

export const MOOD_VISUALS: Record<EntityMood, EntityVisuals> = {
  calm:       { bgColor: "#0a0c1a", glowColor: "rgba(140,170,210,", particleColor: "rgba(160,185,220,", particleDensity: 0.3, breatheFrequency: 3.0, breatheAmplitude: 0.25, blur: 0, brightness: 1.0 },
  warm:       { bgColor: "#0c0b18", glowColor: "rgba(255,185,110,", particleColor: "rgba(255,210,150,", particleDensity: 0.5, breatheFrequency: 2.2, breatheAmplitude: 0.4, blur: 0, brightness: 1.1 },
  melancholy: { bgColor: "#060812", glowColor: "rgba(130,160,200,", particleColor: "rgba(150,175,215,", particleDensity: 0.25, breatheFrequency: 1.8, breatheAmplitude: 0.2, blur: 0.5, brightness: 0.85 },
  curious:    { bgColor: "#0a0e1e", glowColor: "rgba(170,200,230,", particleColor: "rgba(180,210,240,", particleDensity: 0.4, breatheFrequency: 3.5, breatheAmplitude: 0.3, blur: 0, brightness: 1.05 },
  distant:    { bgColor: "#050710", glowColor: "rgba(100,130,170,", particleColor: "rgba(120,145,180,", particleDensity: 0.15, breatheFrequency: 1.2, breatheAmplitude: 0.12, blur: 2, brightness: 0.7 },
  bright:     { bgColor: "#0e0e22", glowColor: "rgba(255,200,130,", particleColor: "rgba(255,220,160,", particleDensity: 0.6, breatheFrequency: 2.8, breatheAmplitude: 0.45, blur: 0, brightness: 1.2 },
  sleeping:   { bgColor: "#030510", glowColor: "rgba(60,80,120,",   particleColor: "rgba(80,100,140,",   particleDensity: 0.08,breatheFrequency: 0.6, breatheAmplitude: 0.08, blur: 4, brightness: 0.5 },
};

// ============================================================
// 三层空间定义
// ============================================================

export type RealityLayer = "memory" | "dream" | "dialogue";

export interface LayerState {
  current: RealityLayer;
  target: RealityLayer;
  progress: number;  // 0-1 transition
  zoom: number;
  yOffset: number;
}

// ============================================================
// 工具函数
// ============================================================

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

export function createDefaultEntity(memoryId: string, memoryName: string): EntityState {
  const now = Date.now();
  return {
    memoryId, memoryName,
    personality: { warmth: 0.6, openness: 0.5, stability: 0.6, nostalgia: 0.5, humor: 0.4, gentleness: 0.7 },
    emotion: { valence: 0.3, arousal: 0.5, dominant: "calm", lastShift: now },
    memoryGraph: { strongMemories: [], fadingMemories: [], coreMemory: null, lastReinforced: now },
    relationship: { userAttachmentLevel: 0.3, interactionCount: 0, lastInteractionTime: now, deepConversationCount: 0, attachmentTrend: "stable" },
    lifecycle: "awakening",
    presenceIntensity: 0.6,
    lastUpdated: now,
    version: 1,
  };
}