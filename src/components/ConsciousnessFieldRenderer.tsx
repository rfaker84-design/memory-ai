"use client";
import { useRef, useEffect } from "react";
import type { ConsciousnessNode } from "../../app/api/consciousness-convergence/route";

interface Props {
  nodes: ConsciousnessNode[];
  coreNode: ConsciousnessNode | null;
  hoveredId: string | null;
  convergenceIndex: number;
}

/* ====================================================================
   Consciousness Field Renderer — Canvas neural-fluid visualization
   ==================================================================== */
export default function ConsciousnessFieldRenderer({ nodes, coreNode, hoveredId, convergenceIndex }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const W = canvas.width = canvas.offsetWidth * devicePixelRatio;
    const H = canvas.height = canvas.offsetHeight * devicePixelRatio;
    ctx.scale(devicePixelRatio, devicePixelRatio);
    const cw = canvas.offsetWidth;
    const ch = canvas.offsetHeight;

    // ── 场背景渐变 ──
    const bgGrad = ctx.createRadialGradient(cw * 0.5, ch * 0.45, 0, cw * 0.5, ch * 0.45, cw * 0.7);
    bgGrad.addColorStop(0, "rgba(20,35,70,0.4)");
    bgGrad.addColorStop(1, "rgba(3,6,18,1)");
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, cw, ch);

    // ── 节点间连线（相似性流）──
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const a = nodes[i], b = nodes[j];
        const ex = a.emotional_vector.valence - b.emotional_vector.valence;
        const ey = a.emotional_vector.arousal - b.emotional_vector.arousal;
        const ez = a.emotional_vector.dominance - b.emotional_vector.dominance;
        const emotDist = Math.sqrt(ex * ex + ey * ey + ez * ez);
        const similarity = Math.max(0, 1 - emotDist);

        if (similarity > 0.6) {
          const ax = (a.position.x / 100) * cw;
          const ay = (a.position.y / 100) * ch;
          const bx = (b.position.x / 100) * cw;
          const by = (b.position.y / 100) * ch;

          ctx.beginPath();
          ctx.moveTo(ax, ay);
          ctx.lineTo(bx, by);
          ctx.strokeStyle = `rgba(120,160,220,${0.04 + similarity * 0.12})`;
          ctx.lineWidth = 0.3 + similarity * 0.8;
          ctx.stroke();
        }
      }
    }

    // ── 渲染节点 ──
    for (const node of nodes) {
      const cx = (node.position.x / 100) * cw;
      const cy = (node.position.y / 100) * ch;
      const r = node.radius * (cw / 800);
      const isHovered = hoveredId === node.id;
      const isCore = node.type === "core";
      const alpha = isHovered ? 0.95 : isCore ? 0.85 : node.lifecycle === "fading" ? 0.2 : 0.5 + node.intensity * 0.4;
      const glowR = r * (isCore ? 4 : isHovered ? 3 : 2);

      // 外光晕
      const glow = ctx.createRadialGradient(cx, cy, r * 0.3, cx, cy, glowR);
      const glowColor = node.glow_color || "rgba(140,180,220,";
      glow.addColorStop(0, `${glowColor}${alpha * 0.6})`);
      glow.addColorStop(0.5, `${glowColor}${alpha * 0.2})`);
      glow.addColorStop(1, "transparent");
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(cx, cy, glowR, 0, Math.PI * 2);
      ctx.fill();

      // 核心发光脉冲（仅 core node）
      if (isCore) {
        const pulseR = glowR * (1 + Math.sin(Date.now() * 0.003) * 0.2);
        const pulseGlow = ctx.createRadialGradient(cx, cy, r * 0.5, cx, cy, pulseR);
        pulseGlow.addColorStop(0, `${glowColor}0.9)`);
        pulseGlow.addColorStop(0.3, `${glowColor}0.5)`);
        pulseGlow.addColorStop(1, "transparent");
        ctx.fillStyle = pulseGlow;
        ctx.beginPath();
        ctx.arc(cx, cy, pulseR, 0, Math.PI * 2);
        ctx.fill();
      }

      // 节点实体
      const coreGrad = ctx.createRadialGradient(cx - r * 0.3, cy - r * 0.3, r * 0.1, cx, cy, r);
      coreGrad.addColorStop(0, "rgba(240,245,255,0.95)");
      coreGrad.addColorStop(0.5, `${glowColor}0.8)`);
      coreGrad.addColorStop(1, `${glowColor}0.3)`);
      ctx.fillStyle = coreGrad;
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fill();

      // hover 高亮环
      if (isHovered) {
        ctx.strokeStyle = `${glowColor}0.7)`;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(cx, cy, r + 3, 0, Math.PI * 2);
        ctx.stroke();
      }

      // 融合线（merged_from → 当前节点）
      if (node.merged_from) {
        for (const mergedId of node.merged_from) {
          const source = nodes.find(n => n.id === mergedId);
          if (source) {
            const sx = (source.position.x / 100) * cw;
            const sy = (source.position.y / 100) * ch;
            ctx.beginPath();
            ctx.moveTo(sx, sy);
            ctx.lineTo(cx, cy);
            ctx.strokeStyle = `${glowColor}0.15)`;
            ctx.lineWidth = 0.5;
            ctx.setLineDash([3, 5]);
            ctx.stroke();
            ctx.setLineDash([]);
          }
        }
      }

      // 标签（仅 hover / core）
      if (isHovered || isCore) {
        ctx.fillStyle = isCore ? "rgba(220,235,255,0.65)" : "rgba(180,200,230,0.55)";
        ctx.font = `${isCore ? 11 : 9}px "Noto Sans SC", sans-serif`;
        ctx.textAlign = "center";
        ctx.fillText(node.name, cx, cy - r - 10);
        if (isHovered) {
          ctx.fillStyle = "rgba(140,160,200,0.35)";
          ctx.font = '8px "Noto Sans SC", sans-serif';
          ctx.fillText(node.relationship, cx, cy - r - 0);
        }
      }
    }

    // ── 收敛度指示器 ──
    ctx.fillStyle = "rgba(140,180,220,0.15)";
    ctx.font = '9px "Noto Sans SC", sans-serif';
    ctx.textAlign = "right";
    ctx.fillText(`收敛度 ${Math.round(convergenceIndex * 100)}%`, cw - 16, ch - 12);
  });

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0"
      style={{ width: "100%", height: "100%" }}
    />
  );
}