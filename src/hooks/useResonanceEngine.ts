"use client";
import { useRef, useEffect, useCallback, useState } from "react";

export interface ResonanceNode {
  memoryId: string;
  resonance: number;
  velocity: number;
  lastPulse: number;
}

interface ResonanceEngineOptions {
  onPulse?: (memoryId: string, strength: number) => void;
}

export default function useResonanceEngine({ onPulse }: ResonanceEngineOptions = {}) {
  const [activeResonances, setActiveResonances] = useState<Map<string, ResonanceNode>>(new Map());
  const pulseTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  // 注册 memory 进入共鸣追踪
  const register = useCallback((memoryId: string, initialResonance: number) => {
    setActiveResonances(prev => {
      const next = new Map(prev);
      if (!next.has(memoryId)) {
        next.set(memoryId, {
          memoryId,
          resonance: initialResonance,
          velocity: 0,
          lastPulse: Date.now(),
        });
      }
      return next;
    });
  }, []);

  // 触发共鸣脉冲
  const pulse = useCallback((memoryId: string, strength: number) => {
    setActiveResonances(prev => {
      const next = new Map(prev);
      const node = next.get(memoryId);
      if (node) {
        node.resonance = Math.min(1, node.resonance + strength * 0.02);
        node.velocity = strength;
        node.lastPulse = Date.now();
      }
      return next;
    });

    if (onPulse) onPulse(memoryId, strength);

    // 脉冲衰减
    const existing = pulseTimers.current.get(memoryId);
    if (existing) clearTimeout(existing);
    pulseTimers.current.set(memoryId, setTimeout(() => {
      setActiveResonances(prev => {
        const next = new Map(prev);
        const node = next.get(memoryId);
        if (node) node.velocity = Math.max(0, node.velocity - 0.1);
        return next;
      });
    }, 1500));
  }, [onPulse]);

  // 衰减所有共鸣（循环）
  useEffect(() => {
    const interval = setInterval(() => {
      setActiveResonances(prev => {
        const next = new Map(prev);
        let changed = false;
        for (const [id, node] of next) {
          const elapsed = (Date.now() - node.lastPulse) / 1000;
          if (elapsed > 5) {
            node.resonance = Math.max(0.1, node.resonance - 0.003);
            node.velocity = Math.max(0, node.velocity - 0.005);
            changed = true;
          }
        }
        return changed ? next : prev;
      });
    }, 2000);

    return () => clearInterval(interval);
  }, []);

  // 获取 memory 的当前共鸣值
  const getResonance = useCallback((memoryId: string): number => {
    const node = activeResonances.get(memoryId);
    return node?.resonance ?? 0;
  }, [activeResonances]);

  // 获取 memory 的脉冲强度 (用于 UI glow)
  const getPulseStrength = useCallback((memoryId: string): number => {
    const node = activeResonances.get(memoryId);
    return node?.velocity ?? 0;
  }, [activeResonances]);

  return { register, pulse, getResonance, getPulseStrength, activeResonances };
}