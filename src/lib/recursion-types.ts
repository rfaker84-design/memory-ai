// ============================================================
// V∞ 无限递归 — 状态递归模型
// 核心：state(n) = transform(state(n-1)), 不可稳定, 无终止
// ============================================================

export interface RecursionState {
  depth: number;
  scale: number;         // 当前层缩放
  rotation: number;      // 当前层旋转(度)
  hue: number;           // 当前层色相(0-360)
  opacity: number;
  timestamp: number;
}

/** state(n) = transform(state(n-1)) */
export function recurse(prev: RecursionState): RecursionState {
  return {
    depth: prev.depth + 1,
    scale: prev.scale * 0.82,                    // 每层缩小
    rotation: (prev.rotation + 7.5) % 360,       // 每层旋转
    hue: (prev.hue + 13.7) % 360,                // 色相偏移
    opacity: Math.max(0.04, prev.opacity * 0.88), // 透明度递减
    timestamp: performance.now(),
  };
}

export function createSeed(): RecursionState {
  return {
    depth: 0,
    scale: 1,
    rotation: 0,
    hue: 210,
    opacity: 1,
    timestamp: performance.now(),
  };
}

/** 最大递归深度 */
export const MAX_DEPTH = 32;