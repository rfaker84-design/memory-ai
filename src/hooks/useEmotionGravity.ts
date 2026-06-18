"use client";
import { useRef, useEffect, useState } from "react";

export interface GravityNode {
  id: string;
  x: number; y: number;
  vx: number; vy: number;
  targetX: number; targetY: number;
  mass: number; // 情绪质量
}

interface UseEmotionGravityOptions {
  count: number;
  gravityCenter: { x: number; y: number };
  mousePos: { x: number; y: number };
  layoutSeed: number;
  hoveredId: string | null;
  clickedId: string | null;
}

function seededRandom(s: number) {
  return () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
}

export default function useEmotionGravity({
  count, gravityCenter, mousePos, layoutSeed, hoveredId, clickedId,
}: UseEmotionGravityOptions) {
  const [nodes, setNodes] = useState<GravityNode[]>([]);
  const rndRef = useRef(seededRandom(layoutSeed));
  const initializedRef = useRef(false);

  // 初始化节点位置
  if (!initializedRef.current || nodes.length !== count) {
    initializedRef.current = true;
    const rnd = seededRandom(layoutSeed);
    const initial: GravityNode[] = Array.from({ length: count }, (_, i) => {
      const angle = rnd() * Math.PI * 2;
      const radius = 15 + rnd() * 32;
      return {
        id: `gn_${i}`,
        x: 50 + Math.cos(angle) * radius,
        y: 32 + Math.sin(angle) * radius * 0.65,
        vx: 0, vy: 0,
        targetX: 50 + Math.cos(angle) * radius,
        targetY: 32 + Math.sin(angle) * radius * 0.65,
        mass: 0.5 + rnd() * 0.5,
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

        // 引力：向 gravity center
        const gdx = gravityCenter.x - n.x;
        const gdy = gravityCenter.y - n.y;
        const gDist = Math.max(Math.sqrt(gdx * gdx + gdy * gdy), 1);
        fx += gdx * 0.001 * n.mass;
        fy += gdy * 0.001 * n.mass;

        // 鼠标斥力
        const mdx = n.x - mousePos.x;
        const mdy = n.y - mousePos.y;
        const mDist = Math.max(Math.sqrt(mdx * mdx + mdy * mdy), 0.5);
        const mouseForce = 8 / (mDist * mDist);
        fx += (mdx / mDist) * mouseForce;
        fy += (mdy / mDist) * mouseForce;

        // hover 节点：吸引其他节点
        if (hoveredId && hoveredId !== n.id) {
          const hoveredNode = prev.find(p => p.id === hoveredId);
          if (hoveredNode) {
            fx += (hoveredNode.x - n.x) * 0.003;
            fy += (hoveredNode.y - n.y) * 0.003;
          }
        }

        // click 节点：排斥所有其他节点
        if (clickedId && clickedId !== n.id) {
          const cdx = n.x - (gravityCenter.x);
          const cdy = n.y - (gravityCenter.y);
          const cDist = Math.max(Math.sqrt(cdx * cdx + cdy * cdy), 0.1);
          fx += (cdx / cDist) * 3;
          fy += (cdy / cDist) * 3;
        }

        // 节点间弱排斥
        for (let j = 0; j < prev.length; j++) {
          if (i === j) continue;
          const dx = n.x - prev[j].x;
          const dy = n.y - prev[j].y;
          const dist = Math.max(Math.sqrt(dx * dx + dy * dy), 2);
          const repForce = 15 / (dist * dist);
          fx += (dx / dist) * repForce * 0.3;
          fy += (dy / dist) * repForce * 0.3;
        }

        n.vx = (n.vx + fx) * 0.85;
        n.vy = (n.vy + fy) * 0.85;
        n.x += n.vx;
        n.y += n.vy;

        // 边界约束
        n.x = Math.max(5, Math.min(95, n.x));
        n.y = Math.max(5, Math.min(85, n.y));

        return { ...n };
      }));
    };

    const raf = requestAnimationFrame(tick);
    return () => { running = false; cancelAnimationFrame(raf); };
  }, [gravityCenter.x, gravityCenter.y, mousePos.x, mousePos.y, hoveredId, clickedId]);

  return nodes;
}