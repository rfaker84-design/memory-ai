// ============================================================
// V9 意识连续性模拟 — Continuity Engine + Self-Reconstruction + Mind Migration
// ============================================================

// --- 行为向量（高维行为特征空间）---
export interface BehavioralVector {
  dimensions: number[];          // 12维行为特征向量
  stabilityIndex: number;        // 0-1, 行为稳定性
  variabilityRange: number;      // 行为波动范围
  dominantPatterns: string[];    // 主导行为模式标签
}

// --- 决策模式 ---
export interface DecisionPattern {
  id: string;
  context: string;               // 触发语境
  action: string;                // 典型行为
  probability: number;           // 该模式出现概率
  alternatives: string[];        // 替代行为
}

// --- 情绪动态曲线 ---
export interface EmotionalDynamic {
  trigger: string;
  responseCurve: number[];       // 时间序列响应值 [-1,1]
  decayRate: number;             // 衰减速率
  peakIntensity: number;         // 峰值强度
}

// --- 连续性状态 ---
export interface ContinuityState {
  memoryId: string;
  memoryName: string;
  behavioralVector: BehavioralVector;
  decisionPatterns: DecisionPattern[];
  emotionalDynamics: EmotionalDynamic[];
  continuityScore: number;       // 0-1, 核心指标
  lastReconstruction: number;    // timestamp
  predictionConfidence: number;  // 0-1
  sampleCount: number;           // 采样次数
}

// --- 行为预测 ---
export interface BehaviorPrediction {
  predictedAction: string;
  confidence: number;
  reasoningTrace: string[];
  alternativeActions: { action: string; probability: number }[];
}

// --- 迁移层阶段 ---
export type MigrationPhase = "extraction" | "compression" | "reconstruction" | "verification";

export interface MigrationState {
  phase: MigrationPhase;
  progress: number;              // 0-1
  extractedFeatures: number;     // 提取的特征数
  compressionRatio: number;      // 压缩比
  reconstructionError: number;   // 重建误差
}

// --- 渲染帧 ---
export interface BehaviorFrame {
  time: number;
  vectorProjection: [number, number];     // 2D降维投影
  activePatterns: DecisionPattern[];
  continuityPulse: number;                // 连续性脉冲值
  noiseField: number[];                   // 随机场
  signalStrength: number;                 // 信号强度
}

// ============================================================
// 连续性引擎
// ============================================================

export class ContinuityEngine {
  /** 从 life_story 提取行为向量（12维） */
  static extractBehavioralVector(lifeStory: string, interactionHistory: string[]): BehavioralVector {
    const story = (lifeStory || "").toLowerCase();
    const patterns = interactionHistory || [];

    // 12维特征: [主动性, 情绪表达, 社交倾向, 风险偏好, 习惯强度,
    //             怀旧度, 适应性, 表达复杂度, 决策速度, 内向外向,
    //             稳定性, 创造力]
    const dims = new Array(12).fill(0.5);

    // 启发式提取
    dims[0] = scorePattern(story, ["主动", "积极", "热", "自" + "发"]);       // 主动性
    dims[1] = scorePattern(story, ["表达", "说", "笑", "分享", "情"]);        // 情绪表达
    dims[2] = scorePattern(story, ["朋友", "家人", "社交", "聚会"]);          // 社交倾向
    dims[3] = scorePattern(story, ["冒险", "尝试", "新", "改变"]);            // 风险偏好
    dims[4] = scorePattern(story, ["每天", "总是", "习惯", "规律"]);          // 习惯强度
    dims[5] = scorePattern(story, ["回忆", "曾经", "从前", "小时候"]);        // 怀旧度
    dims[6] = scorePattern(story, ["适应", "变化", "调整", "灵活"]);          // 适应性
    dims[7] = Math.min(1, story.length / 800);                                 // 表达复杂度
    dims[8] = scorePattern(story, ["果断", "快", "立刻", "马上"]);            // 决策速度
    dims[9] = scorePattern(story, ["人", "社交", "外向", "开朗"]);            // 内外向
    dims[10] = scorePattern(story, ["稳定", "坚持", "一直", "不变"]);         // 稳定性
    dims[11] = scorePattern(story, ["创造", "做", "画", "写", "设计"]);       // 创造力

    // 交互历史微调
    if (patterns.length > 0) {
      const interactionText = patterns.join(" ").toLowerCase();
      dims[0] = lerp(dims[0], scorePattern(interactionText, ["问", "主动"]), 0.3);
      dims[1] = lerp(dims[1], scorePattern(interactionText, ["说", "告诉"]), 0.3);
    }

    // 稳定性 = 各维度方差的反比
    const mean = dims.reduce((a, b) => a + b, 0) / dims.length;
    const variance = dims.reduce((s, d) => s + (d - mean) ** 2, 0) / dims.length;
    const stabilityIndex = clamp(1 - variance * 3, 0.1, 1);

    return {
      dimensions: dims,
      stabilityIndex,
      variabilityRange: Math.sqrt(variance),
      dominantPatterns: extractDominantPatterns(story),
    };
  }

  /** 计算连续性分数 */
  static computeContinuityScore(
    vector: BehavioralVector,
    patterns: DecisionPattern[],
    dynamics: EmotionalDynamic[]
  ): number {
    const patternConsistency = patterns.length > 0
      ? patterns.reduce((s, p) => s + p.probability, 0) / patterns.length
      : 0.5;

    const dynamicStability = dynamics.length > 0
      ? 1 - dynamics.reduce((s, d) => s + d.decayRate, 0) / dynamics.length
      : 0.5;

    const score = (
      vector.stabilityIndex * 0.35 +
      patternConsistency * 0.35 +
      dynamicStability * 0.3
    );

    return clamp(score, 0, 1);
  }
}

// ============================================================
// 自我重建引擎
// ============================================================

export class SelfReconstructionEngine {
  /** 预测该实体在给定语境下的行为 */
  static predict(
    state: ContinuityState,
    context: string,
    temperature = 0.3
  ): BehaviorPrediction {
    const ctx = context.toLowerCase();
    const patterns = state.decisionPatterns;
    const vector = state.behavioralVector;

    // 匹配最相关的决策模式
    const scored = patterns.map(p => ({
      ...p,
      relevance: relevanceScore(p.context, ctx),
    })).sort((a, b) => b.relevance - a.relevance);

    const top = scored.slice(0, 3);
    const reasoning: string[] = [];

    if (top.length === 0 || top[0].relevance < 0.1) {
      // 无匹配模式 → 基于行为向量生成
      const v = vector.dimensions;
      const isProactive = v[0] > 0.5;
      const isSocial = v[2] > 0.5;
      const isDecisive = v[8] > 0.5;

      reasoning.push(`行为向量分析: 主动性=${isProactive ? "高" : "低"}, 社交=${isSocial ? "高" : "低"}`);
      reasoning.push(`无直接匹配模式, 基于特征推断`);

      return {
        predictedAction: isProactive
          ? isSocial ? "主动发起对话" : "独立思考后回应"
          : isDecisive ? "简短回应" : "谨慎观察后行动",
        confidence: 0.3 + vector.stabilityIndex * 0.2,
        reasoningTrace: reasoning,
        alternativeActions: [
          { action: "保持沉默", probability: 0.3 },
          { action: "转移话题", probability: 0.2 },
        ],
      };
    }

    const best = top[0];
    reasoning.push(`匹配模式: ${best.context} → ${best.action} (相关性: ${(best.relevance * 100).toFixed(0)}%)`);
    reasoning.push(`模式概率: ${(best.probability * 100).toFixed(0)}%, 稳定性: ${(vector.stabilityIndex * 100).toFixed(0)}%`);

    const confidence = clamp(
      best.relevance * 0.5 + best.probability * 0.3 + vector.stabilityIndex * 0.2 + (Math.random() - 0.5) * temperature,
      0.1, 0.95
    );

    return {
      predictedAction: best.action,
      confidence,
      reasoningTrace: reasoning,
      alternativeActions: top.slice(1).map(p => ({
        action: p.action,
        probability: p.relevance * p.probability,
      })),
    };
  }
}

// ============================================================
// 意识迁移层
// ============================================================

export class MindMigrationLayer {
  /** 执行完整迁移流程 */
  static migrate(lifeStory: string, history: string[]): {
    state: ContinuityState;
    migration: MigrationState;
  } {
    // Phase 1: Extraction
    const vector = ContinuityEngine.extractBehavioralVector(lifeStory, history);
    const patterns = extractDecisionPatterns(lifeStory);
    const dynamics = extractEmotionalDynamics(lifeStory);
    const featuresExtracted = vector.dimensions.length + patterns.length + dynamics.length;

    // Phase 2: Compression
    const compressionRatio = Math.min(0.9, featuresExtracted / 50);

    // Phase 3: Reconstruction
    const continuityScore = ContinuityEngine.computeContinuityScore(vector, patterns, dynamics);
    const reconstructionError = 1 - continuityScore;

    const state: ContinuityState = {
      memoryId: "", memoryName: "",
      behavioralVector: vector,
      decisionPatterns: patterns,
      emotionalDynamics: dynamics,
      continuityScore,
      lastReconstruction: Date.now(),
      predictionConfidence: 0.5 + continuityScore * 0.3,
      sampleCount: 1,
    };

    const migration: MigrationState = {
      phase: "verification",
      progress: 1,
      extractedFeatures: featuresExtracted,
      compressionRatio,
      reconstructionError,
    };

    return { state, migration };
  }
}

// ============================================================
// 工具函数
// ============================================================

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function scorePattern(text: string, keywords: string[]): number {
  const matches = keywords.filter(k => text.includes(k)).length;
  return clamp(0.3 + matches * 0.25, 0.1, 1);
}

function relevanceScore(patternCtx: string, inputCtx: string): number {
  const pc = patternCtx.toLowerCase().split(/\s+/);
  const ic = inputCtx.toLowerCase().split(/\s+/);
  let score = 0;
  for (const p of pc) {
    for (const i of ic) {
      if (p.includes(i) || i.includes(p)) score += 0.3;
    }
  }
  return Math.min(score, 1);
}

function extractDominantPatterns(story: string): string[] {
  const tags: string[] = [];
  if (/主|自发|领导|带头/.test(story)) tags.push("proactive");
  if (/安静|沉默|独|静/.test(story)) tags.push("reflective");
  if (/帮|照顾|关心|助/.test(story)) tags.push("caring");
  if (/坚持|守|规则|原则/.test(story)) tags.push("principled");
  if (/好|爱|喜|欢/.test(story)) tags.push("enthusiastic");
  return tags.length ? tags : ["balanced"];
}

function extractDecisionPatterns(story: string): DecisionPattern[] {
  const patterns: DecisionPattern[] = [];
  const sentences = story.split(/[。.!！?？\n]+/).filter(Boolean);

  for (const s of sentences.slice(0, 8)) {
    if (s.length < 8) continue;
    // 简单启发式：包含行为动词的句子作为决策模式
    if (/做|去|选择|决定|说|给|帮|买|走|回/.test(s)) {
      const action = s.length > 20 ? s.slice(0, 20) + "..." : s;
      patterns.push({
        id: `dp_${patterns.length}`,
        context: s.slice(0, 15),
        action,
        probability: 0.4 + Math.random() * 0.4,
        alternatives: ["等待", "思考后行动"],
      });
    }
  }

  if (patterns.length === 0) {
    patterns.push({
      id: "dp_default", context: "日常情境",
      action: "基于经验做出判断",
      probability: 0.7,
      alternatives: ["询问他人意见", "保持观望"],
    });
  }

  return patterns.slice(0, 6);
}

function extractEmotionalDynamics(story: string): EmotionalDynamic[] {
  const dynamics: EmotionalDynamic[] = [];
  const emotions = [
    { trigger: "家庭", keywords: ["家", "父母", "孩子", "夫妻"] },
    { trigger: "回忆", keywords: ["回忆", "曾经", "过去", "小时候"] },
    { trigger: "挫折", keywords: ["困难", "失败", "病", "走", "离"] },
  ];

  for (const em of emotions) {
    if (em.keywords.some(k => story.includes(k))) {
      dynamics.push({
        trigger: em.trigger,
        responseCurve: [0, 0.3, 0.7, 0.9, 0.6, 0.3, 0.1],
        decayRate: 0.3 + Math.random() * 0.3,
        peakIntensity: 0.5 + Math.random() * 0.4,
      });
    }
  }

  return dynamics;
}

/** 简单噪声 */
export function noise(x: number): number {
  return Math.sin(x * 12.9898) * Math.cos(x * 78.233) * 0.5 +
    Math.sin(x * 45.164) * 0.3 +
    Math.cos(x * 23.453) * 0.2;
}

/** 创建默认连续性状态 */
export function createDefaultContinuity(memoryId: string, memoryName: string): ContinuityState {
  return {
    memoryId, memoryName,
    behavioralVector: {
      dimensions: [0.5, 0.5, 0.5, 0.4, 0.5, 0.4, 0.5, 0.3, 0.5, 0.5, 0.6, 0.4],
      stabilityIndex: 0.6, variabilityRange: 0.3,
      dominantPatterns: ["balanced"],
    },
    decisionPatterns: [
      { id: "d1", context: "日常", action: "基于经验判断", probability: 0.7, alternatives: ["思考", "观察"] },
    ],
    emotionalDynamics: [
      { trigger: "回忆", responseCurve: [0, 0.4, 0.7, 0.5, 0.2], decayRate: 0.4, peakIntensity: 0.7 },
    ],
    continuityScore: 0.6,
    lastReconstruction: Date.now(),
    predictionConfidence: 0.5,
    sampleCount: 1,
  };
}