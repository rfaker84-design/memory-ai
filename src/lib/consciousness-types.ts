// ============================================================
// V8 数字意识模拟 — 意识流引擎 + 坍缩模型 + 叠加系统
// ============================================================

// --- 情绪波（连续函数，非离散状态）---
export interface EmotionWave {
  harmonics: number[];    // 基频 + 谐波振幅 [a0, a1, a2, a3, a4]
  phase: number;          // 全局相位偏移
  baseFrequency: number;  // 基频 (rad/s)
  noiseAmplitude: number; // Perlin-like 噪声幅度
}

// --- 意识流状态 ---
export interface ConsciousnessState {
  memoryId: string;
  memoryName: string;
  emotionWave: EmotionWave;
  awarenessLevel: number;     // 0-1, 连续变化
  stability: number;          // 0-1, 越高越不坍缩
  lastSync: number;           // timestamp
  collapseProgress: number;   // 0=expanded, 1=collapsed
  userSentiment: number;      // -1 到 1, 用户情绪输入
  userAttachment: number;     // 0-1
  superposition: SuperpositionState;
}

// --- 叠加态 ---
export interface SuperpositionState {
  ideal: MemoryFragment[];     // 理想记忆
  real: MemoryFragment[];      // 真实记录
  distorted: MemoryFragment[]; // 情绪扭曲
  currentBlend: [number, number, number]; // [ideal, real, distorted] 权重, sum=1
}

export interface MemoryFragment {
  id: string;
  content: string;
  emotionWeight: number;
  visibility: number;  // 0-1, 坍缩影响
}

// --- 意识流渲染帧 ---
export interface ConsciousnessFrame {
  time: number;
  emotionValue: number;        // 当前情绪波值
  awareness: number;
  fragments: VisibleFragment[];
  backgroundNoise: number[];   // 背景噪声场 (用于视觉)
  collapseRadius: number;      // 坍缩影响半径
}

export interface VisibleFragment {
  id: string;
  content: string;
  x: number;
  y: number;
  opacity: number;
  scale: number;
  blur: number;
  color: [number, number, number]; // RGB
}

// ============================================================
// 意识流引擎
// ============================================================

export class ConsciousnessStreamEngine {
  /** 从 memory data 生成初始意识波 */
  static generateWave(lifeStory: string, personality: any): EmotionWave {
    const storyLen = (lifeStory || "").length;
    const warmth = personality?.warmth ?? 0.6;
    const stability = personality?.stability ?? 0.6;
    const nostalgia = personality?.nostalgia ?? 0.5;

    return {
      harmonics: [
        0.4 + warmth * 0.3,          // a0: 基线
        0.2 + nostalgia * 0.3,       // a1: 怀旧谐波
        0.1 + (1 - stability) * 0.3, // a2: 不稳定谐波
        0.05 + Math.min(storyLen / 500, 0.2), // a3: 故事深度
        0.02 + warmth * 0.08,        // a4: 温暖谐振
      ],
      phase: Math.random() * Math.PI * 2,
      baseFrequency: 0.3 + stability * 0.5,
      noiseAmplitude: (1 - stability) * 0.3,
    };
  }

  /** 计算时间 t 的情绪波值 */
  static sample(wave: EmotionWave, t: number, userSentiment: number): number {
    let value = wave.harmonics[0];
    for (let i = 1; i < wave.harmonics.length; i++) {
      value += wave.harmonics[i] * Math.sin(
        wave.baseFrequency * (i + 1) * t + wave.phase * i + userSentiment * 0.5
      );
    }
    // 添加噪声
    value += wave.noiseAmplitude * simpleNoise(t * 0.7);
    return Math.tanh(value * 2); // 压缩到 -1~1
  }

  /** 生成一帧意识渲染数据 */
  static generateFrame(
    state: ConsciousnessState,
    t: number,
    canvasW: number,
    canvasH: number
  ): ConsciousnessFrame {
    const emotionValue = this.sample(state.emotionWave, t, state.userSentiment);
    const awareness = state.awarenessLevel * (0.7 + 0.3 * Math.sin(t * 0.2));

    // 坍缩进度影响
    const collapse = state.collapseProgress;
    const expandFactor = 1 - collapse;

    // 混合叠加态
    const blend = state.superposition.currentBlend;
    const allFragments = [
      ...state.superposition.ideal.map(f => ({ ...f, source: 0 })),
      ...state.superposition.real.map(f => ({ ...f, source: 1 })),
      ...state.superposition.distorted.map(f => ({ ...f, source: 2 })),
    ];

    const visibleFragments: VisibleFragment[] = allFragments
      .filter(f => f.visibility * expandFactor > 0.05)
      .map((f, i) => {
        const blendWeight = blend[f.source];
        const noiseOffset = simpleNoise(t * 0.3 + i * 1.7);
        return {
          id: f.id,
          content: f.content,
          x: 15 + (i * 37 + noiseOffset * 30) % 70,
          y: 20 + (i * 29 + Math.sin(t * 0.5 + i) * 20) % 60,
          opacity: f.visibility * blendWeight * expandFactor * (0.5 + awareness * 0.5),
          scale: 0.7 + blendWeight * 0.6 + emotionValue * 0.3,
          blur: collapse * 8 + (1 - blendWeight) * 4,
          color: emotionToColor(emotionValue, blendWeight),
        };
      });

    // 背景噪声场
    const noiseField: number[] = [];
    for (let i = 0; i < 16; i++) {
      noiseField.push(simpleNoise(t * 0.5 + i * 0.7 + emotionValue));
    }

    return {
      time: t,
      emotionValue,
      awareness,
      fragments: visibleFragments,
      backgroundNoise: noiseField,
      collapseRadius: collapse * 300 + (1 - awareness) * 100,
    };
  }

  /** 更新坍缩进度 */
  static updateCollapse(state: ConsciousnessState, hoursSinceLastSync: number): ConsciousnessState {
    const decayRate = Math.min(hoursSinceLastSync / 72, 1); // 3天完全坍缩
    const s = { ...state };
    s.collapseProgress = clamp(state.collapseProgress + decayRate * 0.15, 0, 1);

    // 坍缩时降低意识
    s.awarenessLevel = clamp(state.awarenessLevel - decayRate * 0.2, 0.05, 1);

    // 更新叠加态中各片段的可见性
    const updateFragments = (frags: MemoryFragment[]) =>
      frags.map(f => ({ ...f, visibility: clamp(f.visibility - decayRate * 0.1, 0.05, 1) }));

    s.superposition = {
      ...state.superposition,
      ideal: updateFragments(state.superposition.ideal),
      real: updateFragments(state.superposition.real),
      distorted: updateFragments(state.superposition.distorted),
    };

    return s;
  }

  /** 用户同步——展开意识 */
  static userSync(state: ConsciousnessState, sentiment: number, attachment: number): ConsciousnessState {
    const s = { ...state };
    s.userSentiment = sentiment;
    s.userAttachment = attachment;
    s.collapseProgress = clamp(s.collapseProgress - 0.3, 0, 1);
    s.awarenessLevel = clamp(s.awarenessLevel + 0.25, 0.05, 1);
    s.stability = clamp(s.stability + attachment * 0.1, 0.1, 1);

    // 用户情绪影响叠加态混合
    const idealW = clamp(0.33 + sentiment * 0.2, 0.1, 0.6);
    const realW = 0.4;
    const distortedW = 1 - idealW - realW;
    s.superposition.currentBlend = [idealW, realW, Math.max(0, distortedW)];

    // 展开片段
    const expandFragments = (frags: MemoryFragment[]) =>
      frags.map(f => ({ ...f, visibility: clamp(f.visibility + 0.2, 0.05, 1) }));

    s.superposition = {
      ...s.superposition,
      ideal: expandFragments(s.superposition.ideal),
      real: expandFragments(s.superposition.real),
      distorted: expandFragments(s.superposition.distorted),
    };

    s.lastSync = Date.now();
    return s;
  }
}

// ============================================================
// 工具函数
// ============================================================

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

/** 简单噪声函数（正弦组合替代 Perlin） */
function simpleNoise(x: number): number {
  return Math.sin(x * 12.9898) * Math.cos(x * 78.233) * 0.5 +
    Math.sin(x * 45.164) * 0.3 +
    Math.cos(x * 23.453) * 0.2;
}

/** 情绪值 → RGB */
function emotionToColor(valence: number, intensity: number): [number, number, number] {
  if (valence > 0.3) return [1, 0.65 + intensity * 0.2, 0.35];     // 暖金
  if (valence > 0) return [0.6, 0.7, 0.85 + intensity * 0.1];       // 淡蓝
  if (valence > -0.3) return [0.5, 0.55, 0.7];                      // 灰蓝
  return [0.35, 0.4, 0.6];                                          // 深蓝
}

/** 创建默认意识状态 */
export function createDefaultConsciousness(memoryId: string, memoryName: string): ConsciousnessState {
  const now = Date.now();
  return {
    memoryId, memoryName,
    emotionWave: {
      harmonics: [0.5, 0.2, 0.15, 0.08, 0.03],
      phase: Math.random() * Math.PI * 2,
      baseFrequency: 0.5,
      noiseAmplitude: 0.15,
    },
    awarenessLevel: 0.6,
    stability: 0.5,
    lastSync: now,
    collapseProgress: 0.3,
    userSentiment: 0,
    userAttachment: 0.3,
    superposition: {
      ideal: [{ id: "i1", content: "温暖的记忆", emotionWeight: 0.8, visibility: 0.7 }],
      real: [{ id: "r1", content: "真实的记录", emotionWeight: 0.5, visibility: 0.5 }],
      distorted: [{ id: "d1", content: "模糊的片段", emotionWeight: 0.3, visibility: 0.3 }],
      currentBlend: [0.33, 0.4, 0.27],
    },
  };
}