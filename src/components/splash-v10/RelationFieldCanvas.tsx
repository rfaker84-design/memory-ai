"use client";
import { useRef, useEffect } from "react";
import type { RelationalField, PossibilityField, Relation } from "../../lib/ontology-types";

interface Props {
  field: RelationalField;
  possibility: PossibilityField;
  phase: number;
}

const W = 800, H = 600;
const TYPE_COLORS: Record<string, string> = {
  memory: "rgba(180,200,255,", emotion: "rgba(255,180,200,", identity: "rgba(200,255,200,",
  time: "rgba(255,220,180,", causal: "rgba(255,200,255,", spatial: "rgba(180,255,220,",
};

export default function RelationFieldCanvas({ field, possibility, phase }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const tRef = useRef(0);
  const nodePosRef = useRef<Map<string, [number, number]>>(new Map());

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // 初始化节点位置
    const nodes = new Set<string>();
    for (const r of field.relations) { nodes.add(r.subject); nodes.add(r.object); }
    const nodeArr = Array.from(nodes);
    const posMap = new Map<string, [number, number]>();
    for (let i = 0; i < nodeArr.length; i++) {
      const angle = (2 * Math.PI * i) / nodeArr.length;
      const r = 120 + (i % 3) * 60;
      posMap.set(nodeArr[i], [W / 2 + Math.cos(angle) * r, H / 2 + Math.sin(angle) * r * 0.7]);
    }
    nodePosRef.current = posMap;

    let running = true;
    const tick = () => {
      if (!running) return;
      tRef.current += 0.016;
      const t = tRef.current;
      const alpha = phase;

      ctx.clearRect(0, 0, W, H);
      ctx.fillStyle = "#02040a";
      ctx.fillRect(0, 0, W, H);

      // 参考圆
      ctx.beginPath();
      ctx.arc(W / 2, H / 2, 180, 0, Math.PI * 2);
      ctx.strokeStyle = "rgba(40,60,100,0.06)";
      ctx.lineWidth = 1;
      ctx.stroke();

      // 关系边
      const rels = field.relations.filter(r => r.stability > 0.02);
      for (const r of rels) {
        const a = posMap.get(r.subject);
        const b = posMap.get(r.object);
        if (!a || !b) continue;

        const visibleAlpha = r.stability * alpha * 0.6;
        if (visibleAlpha < 0.01) continue;

        const color = TYPE_COLORS[r.type] || "rgba(150,150,200,";

        // 线（不稳定关系用虚线）
        ctx.beginPath();
        ctx.moveTo(a[0], a[1]);
        if (r.stability < 0.3) {
          const dx = b[0] - a[0], dy = b[1] - a[1];
          const segments = 8;
          for (let s = 0; s < segments; s++) {
            if (s % 2 === 0) {
              ctx.lineTo(a[0] + dx * s / segments, a[1] + dy * s / segments);
            } else {
              ctx.moveTo(a[0] + dx * s / segments, a[1] + dy * s / segments);
              ctx.lineTo(a[0] + dx * (s + 0.5) / segments, a[1] + dy * (s + 0.5) / segments);
            }
          }
        } else {
          ctx.lineTo(b[0], b[1]);
        }
        ctx.strokeStyle = color + visibleAlpha + ")";
        ctx.lineWidth = 0.5 + r.intensity * 2.5;
        ctx.stroke();

        // 方向箭头（单向关系）
        if (r.direction === "one-way") {
          const mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2;
          const angle = Math.atan2(b[1] - a[1], b[0] - a[0]);
          ctx.beginPath();
          ctx.moveTo(mx, my);
          ctx.lineTo(mx - 5 * Math.cos(angle - 0.5) - 5 * Math.sin(angle - 0.5), my - 5 * Math.sin(angle - 0.5) + 5 * Math.cos(angle - 0.5));
          ctx.lineTo(mx - 5 * Math.cos(angle + 0.5) - 5 * Math.sin(angle + 0.5), my - 5 * Math.sin(angle + 0.5) + 5 * Math.cos(angle + 0.5));
          ctx.fillStyle = color + visibleAlpha + ")";
          ctx.fill();
        }
      }

      // 节点
      for (const [name, pos] of posMap) {
        const relatedRels = rels.filter(r => r.subject === name || r.object === name);
        const avgStability = relatedRels.length > 0
          ? relatedRels.reduce((s, r) => s + r.stability, 0) / relatedRels.length
          : 0.1;
        const nodeAlpha = Math.max(0.05, avgStability) * alpha;

        // 光晕
        if (nodeAlpha > 0.1) {
          const glow = ctx.createRadialGradient(pos[0], pos[1], 0, pos[0], pos[1], 25);
          glow.addColorStop(0, `rgba(160,200,240,${nodeAlpha * 0.3})`);
          glow.addColorStop(1, "transparent");
          ctx.fillStyle = glow;
          ctx.fillRect(pos[0] - 30, pos[1] - 30, 60, 60);
        }

        // 节点圆
        ctx.beginPath();
        ctx.arc(pos[0], pos[1], 4 + avgStability * 8, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(20,30,50,${nodeAlpha})`;
        ctx.fill();
        ctx.strokeStyle = `rgba(140,180,220,${nodeAlpha})`;
        ctx.lineWidth = 1;
        ctx.stroke();

        // 标签
        ctx.fillStyle = `rgba(180,210,240,${nodeAlpha * 0.9})`;
        ctx.font = '9px "Courier New", monospace';
        ctx.textAlign = "center";
        ctx.fillText(name.slice(0, 8), pos[0], pos[1] + 18);
      }

      // 可能性路径（右下角）
      if (possibility.paths.length > 0 && alpha > 0.4) {
        const px = W - 180, py = H - 160;
        ctx.fillStyle = "rgba(10,20,40,0.7)";
        ctx.fillRect(px, py, 165, 145);
        ctx.strokeStyle = "rgba(60,100,160,0.3)";
        ctx.strokeRect(px, py, 165, 145);

        ctx.fillStyle = "rgba(140,180,220,0.5)";
        ctx.font = '8px "Courier New", monospace';
        ctx.textAlign = "left";
        ctx.fillText("POSSIBILITY FIELD", px + 8, py + 16);
        ctx.fillText(`entropy: ${(possibility.totalEntropy * 100).toFixed(0)}%`, px + 8, py + 30);
        ctx.fillText(`convergence: ${(possibility.convergenceRate * 100).toFixed(0)}%`, px + 8, py + 42);

        for (let i = 0; i < Math.min(possibility.paths.length, 4); i++) {
          const p = possibility.paths[i];
          const barW = p.probability * 100;
          ctx.fillStyle = `rgba(140,180,220,0.3)`;
          ctx.fillRect(px + 8, py + 55 + i * 18, barW, 6);
          ctx.fillStyle = `rgba(180,210,240,0.5)`;
          ctx.fillText(`${(p.probability * 100).toFixed(0)}% ${p.description.slice(0, 12)}`, px + 10 + barW, py + 55 + i * 18 + 5);
        }
      }

      // Header
      ctx.fillStyle = `rgba(120,160,200,${0.4 * alpha})`;
      ctx.font = '10px "Courier New", monospace';
      ctx.textAlign = "left";
      ctx.fillText("CONSCIOUSNESS FIELD TOPOLOGY v10", 16, 24);

      // 场参数
      ctx.fillText(`density:${(field.density * 100).toFixed(0)}% coherence:${(field.coherence * 100).toFixed(0)}% entropy:${(field.entropy * 100).toFixed(0)}%`, 16, 40);

      requestAnimationFrame(tick);
    };

    requestAnimationFrame(tick);
    return () => { running = false; };
  }, [field, possibility, phase]);

  return <canvas ref={canvasRef} width={W} height={H} style={{ width: "100%", height: "100%" }} />;
}