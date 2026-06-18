"use client";
import { useRef, useEffect } from "react";
import type { EcosystemState } from "../../app/api/memory-ecosystem/route";

interface Props {
  ecosystem: EcosystemState | null;
  onNodeClick: (id: string) => void;
}

const STAGE_COLORS: Record<number, string> = {
  0: "rgba(140,170,210,", 1: "rgba(255,180,100,", 2: "rgba(200,140,220,", 3: "rgba(140,220,180,", 4: "rgba(100,100,140,",
};

const STAGE_LABELS: Record<number, string> = { 0: "stable", 1: "evolving", 2: "merging", 3: "splitting", 4: "fading" };

export default function EvolvingNetworkView({ ecosystem, onNodeClick }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !ecosystem?.nodes.length) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const W = canvas.width = canvas.offsetWidth * devicePixelRatio;
    const H = canvas.height = canvas.offsetHeight * devicePixelRatio;
    ctx.scale(devicePixelRatio, devicePixelRatio);
    const cw = canvas.offsetWidth;
    const ch = canvas.offsetHeight;
    const nodes = ecosystem.nodes;

    // Clear
    ctx.fillStyle = "rgba(4,6,16,0.15)";
    ctx.fillRect(0, 0, cw, ch);

    // ── Connections ──
    for (const node of nodes) {
      for (const conn of node.connections) {
        const target = nodes.find(n => n.id === conn.to);
        if (!target) continue;
        const ax = (node.x / 100) * cw;
        const ay = (node.y / 100) * ch;
        const bx = (target.x / 100) * cw;
        const by = (target.y / 100) * ch;
        ctx.beginPath();
        ctx.moveTo(ax, ay);
        ctx.lineTo(bx, by);
        ctx.strokeStyle = `rgba(120,150,200,${0.04 + conn.strength * 0.1})`;
        ctx.lineWidth = 0.3 + conn.strength * 1.2;
        ctx.stroke();
      }
    }

    // ── Nodes ──
    for (const node of nodes) {
      const cx = (node.x / 100) * cw;
      const cy = (node.y / 100) * ch;
      const r = 3 + node.mass * 6;
      const color = STAGE_COLORS[node.mutationStage] || STAGE_COLORS[0];
      const alpha = node.mutationStage === 4 ? 0.2 : 0.55 + node.energy * 0.4;
      const isFocus = node.id === ecosystem.focusId;

      // Glow
      const glow = ctx.createRadialGradient(cx, cy, r * 0.2, cx, cy, r * (isFocus ? 3 : 2));
      glow.addColorStop(0, `${color}${alpha * 0.5})`);
      glow.addColorStop(1, "transparent");
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(cx, cy, r * (isFocus ? 3 : 2), 0, Math.PI * 2);
      ctx.fill();

      // Core
      const coreGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
      coreGrad.addColorStop(0, "rgba(240,245,255,0.9)");
      coreGrad.addColorStop(1, `${color}0.6)`);
      ctx.fillStyle = coreGrad;
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fill();

      // Focus ring
      if (isFocus) {
        ctx.strokeStyle = `${color}0.5)`;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(cx, cy, r + 5, 0, Math.PI * 2);
        ctx.stroke();
      }

      // Label
      if (isFocus || node.mutationStage === 1) {
        ctx.fillStyle = isFocus ? "rgba(220,230,250,0.6)" : "rgba(180,200,220,0.35)";
        ctx.font = `${isFocus ? 10 : 8}px "Noto Sans SC", sans-serif`;
        ctx.textAlign = "center";
        ctx.fillText(node.name, cx, cy - r - 8);
      }
    }

    // ── Stats ──
    ctx.fillStyle = "rgba(140,160,200,0.12)";
    ctx.font = '8px "Noto Sans SC", sans-serif';
    ctx.textAlign = "right";
    ctx.fillText(`tick ${ecosystem.tick} · pressure ${Math.round(ecosystem.environmentalPressure * 100)}%`, cw - 12, ch - 10);
  });

  if (!ecosystem?.nodes.length) return null;

  return (
    <div className="absolute inset-0">
      <canvas ref={canvasRef} className="absolute inset-0" style={{ width: "100%", height: "100%" }} />
      {/* Invisible click targets */}
      {ecosystem.nodes.map((node) => (
        <div
          key={node.id}
          className="absolute"
          style={{
            left: `${node.x}%`, top: `${node.y}%`,
            transform: "translate(-50%, -50%)",
            width: 24, height: 24, borderRadius: "50%", cursor: "pointer", zIndex: 15,
          }}
          onClick={() => onNodeClick(node.id)}
        />
      ))}
    </div>
  );
}