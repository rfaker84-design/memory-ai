"use client";
import { useRef, useEffect, useState, useCallback } from "react";
import type { EcosystemState, EvoNode, EvolutionEvent } from "../lib/ecosystem/EvolutionEngine";
import {
  evolveTick, detectAndMergeClusters, detectAndSplitClusters,
  autonomousBehavior, propagateEmotion,
} from "../lib/ecosystem/EvolutionEngine";
import {
  computeEnvironmentalPressure, computeRecentInteractionRate,
  computeEmotionalVolatility,
} from "../lib/ecosystem/EnvironmentalPressure";

interface UseMemoryEcosystemV7Return {
  ecosystem: EcosystemState | null;
  events: EvolutionEvent[];
  loading: boolean;
  interact: (nodeId: string) => void;
  injectEmotion: (sourceId: string, intensity: number) => void;
  dominance: string;
  stabilityIndex: number;
}

export default function useMemoryEcosystemV7(
  memoryId: string,
  phone: string,
  interactionCount: number,
): UseMemoryEcosystemV7Return {
  const [ecosystem, setEcosystem] = useState<EcosystemState | null>(null);
  const [events, setEvents] = useState<EvolutionEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [dominance, setDominance] = useState("stable");
  const [stabilityIndex, setStabilityIndex] = useState(0.5);

  const nodesRef = useRef<EvoNode[]>([]);
  const animRef = useRef(0);
  const tickRef = useRef(0);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const interactionTimestamps = useRef<number[]>([]);
  const emotionHistory = useRef<Array<{ emotion: string; timestamp: number }>>([]);

  // ─── Initial load ──────────────────────────────────────────
  useEffect(() => {
    if (!memoryId || !phone) return;
    fetch(`/api/memory-ecosystem?memoryId=${memoryId}&phone=${encodeURIComponent(phone)}`)
      .then(r => r.ok ? r.json() : null)
      .then((data: EcosystemState | null) => {
        if (data?.nodes?.length) {
          setEcosystem(data);
          nodesRef.current = data.nodes;
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [memoryId, phone]);

  // ─── RAF evolution loop ────────────────────────────────────
  useEffect(() => {
    if (!ecosystem?.nodes.length) return;
    let running = true;

    const evolve = () => {
      if (!running) return;
      tickRef.current++;
      const tick = tickRef.current;

      // Compute environmental pressure from real data
      const interactionRate = computeRecentInteractionRate(interactionTimestamps.current);
      const volatility = computeEmotionalVolatility(emotionHistory.current);
      const pressureInput = {
        totalInteractions: interactionCount,
        recentInteractionRate: interactionRate,
        userEmotionalVolatility: volatility,
        ecosystemAge: (Date.now() - (ecosystem.generatedAt || Date.now())) / 3600000,
        nodeCount: nodesRef.current.length,
        activeNodeRatio: nodesRef.current.filter(n => n.energy > 0.3).length / Math.max(nodesRef.current.length, 1),
      };
      const pressureOutput = computeEnvironmentalPressure(pressureInput);

      // Core evolution tick
      let { nodes, events: tickEvents } = evolveTick(
        nodesRef.current, pressureOutput.environmentalPressure,
        pressureOutput.evolutionSpeed, tick, ecosystem.focusId,
      );

      // Cluster mutations (every 10 ticks)
      if (tick % 10 === 0) {
        const mergeResult = detectAndMergeClusters(nodes, tick);
        nodes = mergeResult.nodes;
        tickEvents = [...tickEvents, ...mergeResult.events];

        const splitResult = detectAndSplitClusters(nodes, tick);
        nodes = splitResult.nodes;
        tickEvents = [...tickEvents, ...splitResult.events];
      }

      // Autonomous behavior (every 15 ticks)
      if (tick % 15 === 0) {
        const autoResult = autonomousBehavior(nodes, tick);
        nodes = autoResult.nodes;
        tickEvents = [...tickEvents, ...autoResult.events];
      }

      nodesRef.current = nodes;

      // Update state
      setEcosystem(prev => prev ? {
        ...prev,
        nodes,
        tick,
        environmentalPressure: pressureOutput.environmentalPressure,
        evolutionSpeed: pressureOutput.evolutionSpeed,
        lastMutation: tickEvents.length > 0
          ? tickEvents[tickEvents.length - 1].description
          : prev.lastMutation,
      } : prev);

      setDominance(pressureOutput.dominantMode);
      setStabilityIndex(pressureOutput.stabilityIndex);

      if (tickEvents.length > 0) {
        setEvents(prev => [...tickEvents.slice(-20), ...prev].slice(0, 20));
      }

      // Persist every 30 ticks
      if (tick % 30 === 0) {
        if (saveTimer.current) clearTimeout(saveTimer.current);
        saveTimer.current = setTimeout(() => {
          fetch("/api/memory-ecosystem", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              memoryId,
              snapshot: {
                ...ecosystem,
                nodes: nodesRef.current,
                environmentalPressure: pressureOutput.environmentalPressure,
                evolutionSpeed: pressureOutput.evolutionSpeed,
                tick,
              },
            }),
          }).catch(() => {});
        }, 500);
      }

      animRef.current = requestAnimationFrame(evolve);
    };

    animRef.current = requestAnimationFrame(evolve);
    return () => {
      running = false;
      cancelAnimationFrame(animRef.current);
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, [ecosystem?.focusId, ecosystem?.nodes.length, interactionCount]);

  // ─── User interaction → inject energy ──────────────────────
  const interact = useCallback((nodeId: string) => {
    interactionTimestamps.current.push(Date.now());
    emotionHistory.current.push({ emotion: "warm", timestamp: Date.now() });

    nodesRef.current = nodesRef.current.map(n =>
      n.id === nodeId
        ? { ...n, energy: Math.min(1, n.energy + 0.12), mutationStage: n.mutationStage === 4 ? 1 : n.mutationStage }
        : n
    );
    setEcosystem(prev => prev ? {
      ...prev,
      nodes: nodesRef.current,
      environmentalPressure: Math.min(1, (prev.environmentalPressure || 0.3) + 0.04),
    } : prev);
  }, []);

  // ─── Inject emotion wave ───────────────────────────────────
  const injectEmotion = useCallback((sourceId: string, intensity: number) => {
    emotionHistory.current.push({ emotion: "deep", timestamp: Date.now() });
    nodesRef.current = propagateEmotion(nodesRef.current, sourceId, intensity);
    setEcosystem(prev => prev ? { ...prev, nodes: nodesRef.current } : prev);
  }, []);

  return { ecosystem, events, loading, interact, injectEmotion, dominance, stabilityIndex };
}
