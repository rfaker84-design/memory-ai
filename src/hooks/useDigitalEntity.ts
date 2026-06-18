"use client";
import { useState, useEffect, useRef, useCallback } from "react";
import type { EntityState, EntityMood, LifecyclePhase, EvolutionEvent } from "../lib/entity-types";
import { EvolutionEngine, MOOD_VISUALS, createDefaultEntity } from "../lib/entity-types";

interface UseDigitalEntityOptions {
  memoryId: string;
  memoryName: string;
}

export default function useDigitalEntity({ memoryId, memoryName }: UseDigitalEntityOptions) {
  const [entity, setEntity] = useState<EntityState | null>(null);
  const [loading, setLoading] = useState(true);
  const [mood, setMood] = useState<EntityMood>("calm");
  const [visuals, setVisuals] = useState(MOOD_VISUALS.calm);
  const idleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dirtyRef = useRef(false);

  // 加载实体状态
  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch(`/api/entity-state?memoryId=${encodeURIComponent(memoryId)}`);
        if (res.ok && !cancelled) {
          const data = await res.json();
          // 应用衰减 + 访问唤醒
          const state: EntityState = {
            memoryId: data.memoryId || memoryId,
            memoryName: data.personality ? memoryName : memoryName,
            personality: data.personality || createDefaultEntity(memoryId, memoryName).personality,
            emotion: data.emotion || createDefaultEntity(memoryId, memoryName).emotion,
            memoryGraph: data.memoryGraph || createDefaultEntity(memoryId, memoryName).memoryGraph,
            relationship: data.relationship || createDefaultEntity(memoryId, memoryName).relationship,
            lifecycle: data.lifecycle || "awakening",
            presenceIntensity: data.presenceIntensity ?? 0.6,
            lastUpdated: data.lastUpdated || Date.now(),
            version: data.version || 1,
          };
          const evolved = EvolutionEngine.onVisit(state, Date.now());
          setEntity(evolved);
          dirtyRef.current = true;
        }
      } catch { /* use defaults */ }
      finally { if (!cancelled) setLoading(false); }
    }
    load();
    return () => { cancelled = true; };
  }, [memoryId, memoryName]);

  // 情绪 → 视觉同步
  useEffect(() => {
    if (!entity) return;
    const m = EvolutionEngine.computeMood(entity);
    setMood(m);
    // 平滑插值视觉
    const v = MOOD_VISUALS[m];
    setVisuals(prev => ({
      bgColor: v.bgColor,
      glowColor: v.glowColor,
      particleColor: v.particleColor,
      particleDensity: prev.particleDensity + (v.particleDensity - prev.particleDensity) * 0.1,
      breatheFrequency: prev.breatheFrequency + (v.breatheFrequency - prev.breatheFrequency) * 0.1,
      breatheAmplitude: prev.breatheAmplitude + (v.breatheAmplitude - prev.breatheAmplitude) * 0.1,
      blur: prev.blur + (v.blur - prev.blur) * 0.1,
      brightness: prev.brightness + (v.brightness - prev.brightness) * 0.1,
    }));
  }, [entity]);

  // 用户交互回调
  const onUserActive = useCallback(() => {
    if (!entity) return;
    setEntity(prev => {
      if (!prev) return prev;
      const e = { ...prev, emotion: { ...prev.emotion }, lifecycle: "present" as LifecyclePhase };
      e.emotion.arousal = Math.min(1, e.emotion.arousal + 0.05);
      e.presenceIntensity = Math.min(1, e.presenceIntensity + 0.08);
      dirtyRef.current = true;
      return e;
    });
    // 重置空闲计时器
    if (idleTimer.current) clearTimeout(idleTimer.current);
    idleTimer.current = setTimeout(() => {
      setEntity(prev => {
        if (!prev) return prev;
        const e = EvolutionEngine.onUserIdle(prev, Date.now());
        dirtyRef.current = true;
        return e;
      });
    }, 8000);
  }, [entity]);

  const onDeepInteraction = useCallback(() => {
    if (!entity) return;
    setEntity(prev => {
      if (!prev) return prev;
      const e = EvolutionEngine.onDeepConversation(prev, Date.now());
      dirtyRef.current = true;
      return e;
    });
  }, [entity]);

  // 定期保存
  useEffect(() => {
    const interval = setInterval(async () => {
      if (!dirtyRef.current || !entity) return;
      dirtyRef.current = false;
      try {
        await fetch("/api/entity-state", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            memoryId,
            updates: {
              emotion: entity.emotion,
              relationship: entity.relationship,
              lifecycle: entity.lifecycle,
              presenceIntensity: entity.presenceIntensity,
              eventType: "visit",
              description: "状态同步",
            },
          }),
        });
      } catch { /* silent */ }
    }, 15000);
    return () => clearInterval(interval);
  }, [entity, memoryId]);

  // 组件卸载时保存
  useEffect(() => {
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
      if (idleTimer.current) clearTimeout(idleTimer.current);
    };
  }, []);

  return {
    entity, loading, mood, visuals,
    onUserActive, onDeepInteraction,
  };
}