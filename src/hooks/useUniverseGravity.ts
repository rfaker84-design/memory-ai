"use client";
import { useRef, useEffect, useState, useCallback } from "react";

export interface GravityNodeV4 {
  id: string;
  memoryId: string;
  x: number; y: number; z: number;          // z: 0=近, 1=中, 2=远
  vx: number; vy: number;
  mass: number;                              // 情绪质量 (0-1)
  targetX: number; targetY: number;
  layerOpacity: number;                      // 层透明度
  layerScale: number;                        // 层缩放
  layerBlur: number;                         // 层模糊
  interactionBoost: number;                  // 交互增强 (hover/click 累积)
  evolution: number;                         // 演化值 (-1..1)
}

interface UniverseGravityOptions {
  nodes: { memoryId: string; weight: number; z: number; interactionCount: number }[];
  mousePos: { x: number; y: number };
  universeArchetype: string;
  spatialModel: string;
  gravityLogic: string;
  hoveredId: string | null;
  clickedId: string | null;
  userEmotion: { attachment_level: number; curiosity_level: number; sadness_resonance: number };
}

function seededRandom(s: number) {
  return () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
}

// 层视觉参数
const LAYER_PRESETS = [
  { opacity: 1, scale: 1, blur: 0, speedMul: 1.0 },     // z=0 近层
  { opacity: 0.7, scale: 0.7, blur: 1.5, speedMul: 0.6 }, // z=1 中层
  { opacity: 0.35, scale: 0.45, blur: 4, speedMul: 0.25 }, // z=2 远层
];

export default function useUniverseGravity({
  nodes: inputNodes,
  mousePos,
  universeArchetype,
  spatialModel,
  gravityLogic,
  hoveredId,
  clickedId,
  userEmotion,
}: UniverseGravityOptions) {
  const [nodes, setNodes] = useState<GravityNodeV4[]>([]);
  const initializedRef = useRef(false);
  const seedRef = useRef(Date.now() % 10000);

  // 初始化
  if (!initializedRef.current || nodes.length !== inputNodes.length) {
    initializedRef.current = true;
    const rnd = seededRandom(seedRef.current);
    const initial: GravityNodeV4[] = inputNodes.map((n, i) => {
      const angle = (i * 0.618033988749895) % 1 * Math.PI * 2;
      const baseRadius = spatialModel === "dense" ? 10 + rnd() * 20
        : spatialModel === "sparse" ? 20 + rnd() * 35
        : spatialModel === "collapsing" ? 5 + rnd() * 12
        : 15 + rnd() * 25;
      const zRadiusMul = n.z === 0 ? 0.6 : n.z === 1 ? 1.0 : 1.5;
      const r = baseRadius * zRadiusMul;
      const layer = LAYER_PRESETS[Math.min(n.z, 2)];
      return {
        id: `gnv4_${i}`,
        memoryId: n.memoryId,
        x: 50 + Math.cos(angle) * r,
        y: 35 + Math.sin(angle) * r * 0.65,
        z: n.z,
        vx: 0, vy: 0,
        mass: n.weight,
        targetX: 50 + Math.cos(angle) * r,
        targetY: 35 + Math.sin(angle) * r * 0.65,
        layerOpacity: layer.opacity,
        layerScale: layer.scale,
        layerBlur: layer.blur,
        interactionBoost: 0,
        evolution: 0,
      };
    });
    setNodes(initial);
  }

  // RAF 物理模拟
  useEffect(() => {
    let running = true;
    const tick = () => {
      if (!running) return;
      setNodes(prev => prev.map((n, i) => {
        let fx = 0, fy = 0;

        // === 引力系统 ===
        if (gravityLogic === "love_centered") {
          // 高权重的节点在中心，吸引其他
          const heavyNode = prev.reduce((a, b) => a.mass > b.mass ? a : b, prev[0]);
          if (heavyNode && heavyNode.id !== n.id) {
            fx += (heavyNode.x - n.x) * 0.0008 * n.mass;
            fy += (heavyNode.y - n.y) * 0.0008 * n.mass;
          }
        } else if (gravityLogic === "balanced") {
          // 均匀引力
          const cx = 50, cy = 35;
          fx += (cx - n.x) * 0.0005;
          fy += (cy - n.y) * 0.0005;
        } else if (gravityLogic === "trauma_centered") {
          // 最低权重在中心
          const lightNode = prev.reduce((a, b) => a.mass < b.mass ? a : b, prev[0]);
          if (lightNode && lightNode.id !== n.id) {
            fx += (lightNode.x - n.x) * 0.0006;
            fy += (lightNode.y - n.y) * 0.0006;
          }
        } else {
          // fading: 缓慢向外漂移
          fx += (n.x - 50) * 0.0001;
          fy += (n.y - 35) * 0.0001;
        }

        // === 用户注意力引力 ===
        const mdx = mousePos.x - n.x;
        const mdy = mousePos.y - n.y;
        const mDist = Math.max(Math.sqrt(mdx * mdx + mdy * mdy), 2);
        const userPull = userEmotion.attachment_level * 12 / (mDist * 0.8);
        fx += (mdx / mDist) * userPull;
        fy += (mdy / mDist) * userPull;

        // === hover 吸引 ===
        if (hoveredId && hoveredId !== n.memoryId) {
          const hoveredNode = prev.find(p => p.memoryId === hoveredId);
          if (hoveredNode) {
            fx += (hoveredNode.x - n.x) * 0.002;
            fy += (hoveredNode.y - n.y) * 0.002;
          }
        }

        // === click 坍缩 ===
        if (clickedId) {
          if (clickedId === n.memoryId) {
            // 被点击的节点 → 移到中心
            fx += (50 - n.x) * 0.15;
            fy += (35 - n.y) * 0.15;
          } else {
            // 其他节点 → 向外扩散
            const dx = n.x - 50;
            const dy = n.y - 35;
            const d = Math.max(Math.sqrt(dx * dx + dy * dy), 0.1);
            fx += (dx / d) * 4;
            fy += (dy / d) * 4;
          }
        }

        // === 层间速度乘数 ===
        const layerSpeed = LAYER_PRESETS[Math.min(n.z, 2)].speedMul;
        fx *= layerSpeed;
        fy *= layerSpeed;

        // === 节点间排斥 ===
        for (let j = 0; j < prev.length; j++) {
          if (i === j) continue;
          const dx = n.x - prev[j].x;
          const dy = n.y - prev[j].y;
          const dist = Math.max(Math.sqrt(dx * dx + dy * dy), 4);
          const repForce = 20 / (dist * dist);
          fx += (dx / dist) * repForce * 0.25;
          fy += (dy / dist) * repForce * 0.25;
        }

        // 更新速度（阻尼）
        n.vx = (n.vx + fx) * 0.82;
        n.vy = (n.vy + fy) * 0.82;
        n.x += n.vx;
        n.y += n.vy;

        // 边界约束
        n.x = Math.max(2, Math.min(98, n.x));
        n.y = Math.max(2, Math.min(95, n.y));

        // 交互增强衰减
        n.interactionBoost = Math.max(0, n.interactionBoost - 0.003);

        return { ...n };
      }));
    };

    const raf = requestAnimationFrame(tick);
    return () => { running = false; cancelAnimationFrame(raf); };
  }, [mousePos.x, mousePos.y, hoveredId, clickedId, gravityLogic, userEmotion.attachment_level]);

  // 当 hover 变化时更新交互增强
  const boostNode = useCallback((memoryId: string) => {
    setNodes(prev => prev.map(n =>
      n.memoryId === memoryId ? { ...n, interactionBoost: Math.min(1, n.interactionBoost + 0.15) } : n
    ));
  }, []);

  // 更新节点演化
  const evolveNode = useCallback((memoryId: string, delta: number) => {
    setNodes(prev => prev.map(n =>
      n.memoryId === memoryId ? { ...n, evolution: Math.max(-1, Math.min(1, n.evolution + delta)) } : n
    ));
  }, []);

  return { nodes, boostNode, evolveNode };
}