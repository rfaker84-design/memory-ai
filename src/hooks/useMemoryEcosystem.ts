"use client";
import { useRef, useEffect, useState, useCallback } from "react";
import type { EcosystemState, EvoNode } from "../../app/api/memory-ecosystem/route";

type Connection = { to: string; strength: number; type: string };

export default function useMemoryEcosystem(memoryId: string, phone: string) {
  const [ecosystem, setEcosystem] = useState<EcosystemState | null>(null);
  const [loading, setLoading] = useState(true);
  const nodesRef = useRef<EvoNode[]>([]);
  const animRef = useRef(0);
  const tickRef = useRef(0);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!memoryId || !phone) return;
    fetch("/api/memory-ecosystem?memoryId=" + memoryId + "&phone=" + encodeURIComponent(phone))
      .then(r => r.ok ? r.json() : null)
      .then((data: EcosystemState | null) => {
        if (data?.nodes?.length) { setEcosystem(data); nodesRef.current = data.nodes; }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [memoryId, phone]);

  useEffect(() => {
    if (!ecosystem?.nodes.length) return;
    let running = true;

    const evolve = () => {
      if (!running) return;
      tickRef.current++;
      const nodes = nodesRef.current;
      const pressure = ecosystem.environmentalPressure || 0.3;
      const speed = (ecosystem.evolutionSpeed || 1) * 0.015;

      const next = nodes.map((n) => {
        const nn: EvoNode = { ...n, x: n.x, y: n.y, vx: n.vx, vy: n.vy, connections: [...n.connections] };

        nn.vx += (Math.random() - 0.5) * speed * 0.3;
        nn.vy += (Math.random() - 0.5) * speed * 0.3;

        const focusNode = nodes.find(nn => nn.id === ecosystem.focusId);
        if (focusNode && n.id !== ecosystem.focusId) {
          const dx = focusNode.x - nn.x;
          const dy = focusNode.y - nn.y;
          const dist = Math.max(Math.sqrt(dx * dx + dy * dy), 1);
          nn.vx += (dx / dist) * speed * 0.08;
          nn.vy += (dy / dist) * speed * 0.08;
        }

        if (n.mutationStage === 4) {
          nn.energy = Math.max(0.05, n.energy - speed * 0.5);
        } else if (n.mutationStage === 1) {
          nn.energy = Math.min(1, n.energy + speed * 0.3);
        } else {
          nn.energy += (0.5 - n.energy) * speed * 0.1;
        }

        if (n.energy < 0.15 && n.mutationStage === 0) nn.mutationStage = 4;
        else if (n.energy > 0.85 && n.mutationStage === 0 && pressure > 0.4) nn.mutationStage = 1;
        else if (n.energy < 0.1) nn.mutationStage = 4;

        nn.vx *= 0.95;
        nn.vy *= 0.95;
        nn.x += nn.vx;
        nn.y += nn.vy;
        nn.x = Math.max(3, Math.min(97, nn.x));
        nn.y = Math.max(3, Math.min(92, nn.y));

        return nn;
      });

      for (const node of next) {
        node.connections = node.connections.map((c: Connection) => ({
          ...c,
          strength: Math.max(0.05, Math.min(1, c.strength + (Math.random() - 0.5) * speed * 0.2)),
        }));
        node.connections = node.connections.filter((c: Connection) => c.strength > 0.08);
      }

      nodesRef.current = next;
      setEcosystem((prev: EcosystemState | null) => prev ? {
        ...prev, nodes: next, tick: tickRef.current,
        environmentalPressure: Math.min(1, pressure + (Math.random() - 0.5) * 0.02),
        lastMutation: tickRef.current % 60 === 0 ? "tick_" + tickRef.current : prev.lastMutation,
      } : prev);

      if (tickRef.current % 30 === 0) {
        if (saveTimer.current) clearTimeout(saveTimer.current);
        saveTimer.current = setTimeout(() => {
          fetch("/api/memory-ecosystem", {
            method: "PATCH", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ memoryId, snapshot: { ...ecosystem, nodes: nodesRef.current } }),
          }).catch(() => {});
        }, 500);
      }

      animRef.current = requestAnimationFrame(evolve);
    };

    animRef.current = requestAnimationFrame(evolve);
    return () => { running = false; cancelAnimationFrame(animRef.current); if (saveTimer.current) clearTimeout(saveTimer.current); };
  }, [ecosystem?.focusId, ecosystem?.nodes.length]);

  const interact = useCallback((nodeId: string) => {
    nodesRef.current = nodesRef.current.map(n =>
      n.id === nodeId ? { ...n, energy: Math.min(1, n.energy + 0.1), mutationStage: n.mutationStage === 4 ? 1 : n.mutationStage } : n
    );
    setEcosystem((prev: EcosystemState | null) => prev ? { ...prev, nodes: nodesRef.current, environmentalPressure: Math.min(1, (prev.environmentalPressure || 0.3) + 0.05) } : prev);
  }, []);

  return { ecosystem, loading, interact };
}