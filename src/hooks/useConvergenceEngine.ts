"use client";
import { useRef, useEffect, useState, useCallback } from "react";
import type { ConsciousnessNode } from "../../app/api/consciousness-convergence/route";

interface ConvergenceState {
  nodes: ConsciousnessNode[];
  tick: number;
}

export default function useConvergenceEngine(initialNodes: ConsciousnessNode[]) {
  const [state, setState] = useState<ConvergenceState>({ nodes: initialNodes, tick: 0 });
  const animRef = useRef(0);
  const nodesRef = useRef(initialNodes);

  // 重置当初始节点变化
  useEffect(() => {
    nodesRef.current = initialNodes;
    setState({ nodes: initialNodes, tick: 0 });
  }, [initialNodes]);

  // RAF 收敛模拟循环
  useEffect(() => {
    let running = true;

    const tick = () => {
      if (!running) return;
      const nodes = nodesRef.current;
      const next = nodes.map((n) => {
        const nn = { ...n, position: { ...n.position }, velocity: { ...n.velocity } };

        // === 向核心节点收敛 ===
        const core = nodes.find(c => c.type === "core");
        if (core && n.type !== "core") {
          const dx = core.position.x - nn.position.x;
          const dy = core.position.y - nn.position.y;
          const dist = Math.max(Math.sqrt(dx * dx + dy * dy), 1);
          const convergenceForce = 0.0003 * nn.coherence;
          nn.velocity.vx += (dx / dist) * convergenceForce;
          nn.velocity.vy += (dy / dist) * convergenceForce;
        }

        // === 相似节点相互吸引 ===
        for (const other of nodes) {
          if (other.id === n.id) continue;
          const ex = other.emotional_vector.valence - n.emotional_vector.valence;
          const ey = other.emotional_vector.arousal - n.emotional_vector.arousal;
          const ez = other.emotional_vector.dominance - n.emotional_vector.dominance;
          const emotDist = Math.sqrt(ex * ex + ey * ey + ez * ez);
          const similarity = Math.max(0, 1 - emotDist);

          const dx = other.position.x - nn.position.x;
          const dy = other.position.y - nn.position.y;
          const spatialDist = Math.max(Math.sqrt(dx * dx + dy * dy), 2);
          const attractionForce = similarity * 0.0005;
          nn.velocity.vx += (dx / spatialDist) * attractionForce;
          nn.velocity.vy += (dy / spatialDist) * attractionForce;

          // 排斥防止重叠
          if (spatialDist < 5) {
            const repForce = (5 - spatialDist) * 0.002;
            nn.velocity.vx -= (dx / spatialDist) * repForce;
            nn.velocity.vy -= (dy / spatialDist) * repForce;
          }
        }

        // === 生命周期间动态 ===
        if (nn.lifecycle === "fading") {
          nn.coherence = Math.max(0.05, nn.coherence - 0.0005);
          nn.intensity = Math.max(0.05, nn.intensity - 0.001);
        } else if (nn.lifecycle === "emerging") {
          nn.coherence = Math.min(1, nn.coherence + 0.0003);
        }

        // === 阻尼 + 位置更新 ===
        nn.velocity.vx *= 0.94;
        nn.velocity.vy *= 0.94;
        nn.position.x += nn.velocity.vx;
        nn.position.y += nn.velocity.vy;

        // 边界约束
        nn.position.x = Math.max(2, Math.min(98, nn.position.x));
        nn.position.y = Math.max(2, Math.min(95, nn.position.y));

        return nn;
      });

      nodesRef.current = next;
      setState(prev => ({ nodes: next, tick: prev.tick + 1 }));
      animRef.current = requestAnimationFrame(tick);
    };

    animRef.current = requestAnimationFrame(tick);
    return () => { running = false; cancelAnimationFrame(animRef.current); };
  }, []);

  // 共振：用户交互时增强节点
  const resonate = useCallback((nodeId: string) => {
    nodesRef.current = nodesRef.current.map(n =>
      n.id === nodeId
        ? { ...n, intensity: Math.min(1, n.intensity + 0.08), coherence: Math.min(1, n.coherence + 0.03), lifecycle: "active" as const }
        : n
    );
  }, []);

  // 观察：轻微增强
  const observe = useCallback((nodeId: string | null) => {
    if (!nodeId) return;
    nodesRef.current = nodesRef.current.map(n =>
      n.id === nodeId
        ? { ...n, intensity: Math.min(1, n.intensity + 0.03) }
        : n
    );
  }, []);

  return { state, resonate, observe };
}