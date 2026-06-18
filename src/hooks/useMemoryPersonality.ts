"use client";
import { useState, useEffect, useCallback, useRef } from "react";
import type { PersonalityState, PersonalityCore, RelationshipState } from "../../app/api/memory-personality/route";

interface UseMemoryPersonalityReturn {
  personality: PersonalityCore;
  relationship: RelationshipState;
  loading: boolean;
  recordInteraction: (emotion: string, depth: string, summary?: string) => void;
  detectIdle: () => void;
}

const DEFAULTS = {
  personality: { tone: "gentle" as const, familiarity: 0.3, trust: 0.4, emotionalBias: 0.1, expressiveness: 0.5 },
  relationship: { closeness: 0.3, dependency: 0.2, familiarity: 0.3, lastInteraction: Date.now(), totalInteractions: 0, summaryMemory: "" },
};

export default function useMemoryPersonality(memoryId: string): UseMemoryPersonalityReturn {
  const [personality, setPersonality] = useState<PersonalityCore>(DEFAULTS.personality);
  const [relationship, setRelationship] = useState<RelationshipState>(DEFAULTS.relationship);
  const [loading, setLoading] = useState(true);
  const idleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 加载持久化人格
  useEffect(() => {
    if (!memoryId) return;
    fetch(`/api/memory-personality?memoryId=${memoryId}`)
      .then(r => r.ok ? r.json() : null)
      .then((data: PersonalityState | null) => {
        if (data?.personality) {
          setPersonality(data.personality);
          setRelationship(data.relationship);
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [memoryId]);

  // 记录交互（节流 + 防抖）
  const pendingRef = useRef<{ emotion: string; depth: string; summary?: string } | null>(null);
  const flushTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const recordInteraction = useCallback((emotion: string, depth: string, summary?: string) => {
    pendingRef.current = { emotion, depth, summary };
    if (flushTimer.current) clearTimeout(flushTimer.current);
    flushTimer.current = setTimeout(() => {
      const p = pendingRef.current;
      if (!p) return;
      fetch("/api/memory-personality", {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ memoryId, interaction: p }),
      }).then(r => r.ok ? r.json() : null)
        .then((data: PersonalityState | null) => {
          if (data?.personality) { setPersonality(data.personality); setRelationship(data.relationship); }
        }).catch(() => {});
      pendingRef.current = null;
    }, 3000);
  }, [memoryId]);

  // 空闲检测
  const detectIdle = useCallback(() => {
    fetch("/api/memory-personality", {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ memoryId, action: "idle_detected" }),
    }).catch(() => {});
  }, [memoryId]);

  // 15s 空闲 → 通知
  useEffect(() => {
    const reset = () => { if (idleTimer.current) clearTimeout(idleTimer.current); idleTimer.current = setTimeout(detectIdle, 15000); };
    window.addEventListener("mousemove", reset, { passive: true });
    window.addEventListener("keydown", reset, { passive: true });
    reset();
    return () => { window.removeEventListener("mousemove", reset); window.removeEventListener("keydown", reset); if (idleTimer.current) clearTimeout(idleTimer.current); };
  }, [detectIdle]);

  return { personality, relationship, loading, recordInteraction, detectIdle };
}