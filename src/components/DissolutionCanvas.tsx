"use client";
import { useRef, useEffect } from "react";
import type { DissolutionState, DissolutionNode } from "../lib/ecosystem/DissolutionEngine";

interface Props {
  state: DissolutionState | null;
  onNodeClick: (id: string) => void;
}

const PHASE_LABELS: Record<string, string> = {
  stable: "稳定", drifting: "漂移", fragmenting: "碎裂", dissolving: "消散", void: "虚空",
};

export default function DissolutionCanvas({ state, onNodeClick }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !state?.nodes.length) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let running = true;

    const render = () => {
      if (!running) return;

      const W = canvas.width = canvas.offsetWidth * devicePixelRatio;
      const H = canvas.height = canvas.offsetHeight * devicePixelRatio;
      ctx.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
      const cw = canvas.offsetWidth;
      const ch = canvas.offsetHeight;
      const visibleNodes: DissolutionNode[] = state.nodes.filter((n: DissolutionNode) => !n.dissolved);

      ctx.fillStyle = "rgba(4,6,16," + (0.08 + state.systemCoherence * 0.04).toString() + ")";
      ctx.fillRect(0, 0, cw, ch);

      // ── Connections ──
      for (const node of visibleNodes) {
        for (const conn of node.connections) {
          const target = visibleNodes.find((n: DissolutionNode) => n.id === conn.to);
          if (!target) continue;
          const ax = (node.x / 100) * cw;
          const ay = (node.y / 100) * ch;
          const bx = (target.x / 100) * cw;
          const by = (target.y / 100) * ch;

          const alpha = conn.strength * 0.08 * state.systemCoherence;
          if (alpha < 0.005) continue;

          ctx.beginPath();
          ctx.moveTo(ax, ay);
          ctx.lineTo(bx, by);
          ctx.strokeStyle = "rgba(120,140,180," + alpha.toString() + ")";
          ctx.lineWidth = 0.2 + conn.strength * state.systemCoherence * 0.8;
          ctx.setLineDash([2, 8]);
          ctx.stroke();
          ctx.setLineDash([]);
        }
      }

      // ── Nodes ──
      for (const node of visibleNodes) {
        const cx = (node.x / 100) * cw;
        const cy = (node.y / 100) * ch;
        const r = 2 + node.coherence * 5;
        const alpha = node.opacity * (0.3 + state.systemCoherence * 0.5);
        if (alpha < 0.02) continue;

        const glowR = r * (1.5 + node.coherence * 2);
        const glow = ctx.createRadialGradient(cx, cy, r * 0.1, cx, cy, glowR);
        glow.addColorStop(0, "rgba(180,200,230," + (alpha * 0.3).toString() + ")");
        glow.addColorStop(1, "transparent");
        ctx.fillStyle = glow;
        ctx.beginPath();
        ctx.arc(cx, cy, glowR, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = "rgba(200,210,230," + alpha.toString() + ")";
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.fill();

        if (node.coherence > 0.4 || node.id === state.focusId) {
          ctx.fillStyle = "rgba(180,190,210," + (alpha * 0.5).toString() + ")";
          ctx.font = (7 + node.coherence * 3).toString() + 'px "Noto Sans SC", sans-serif';
          ctx.textAlign = "center";
          ctx.fillText(node.name, cx, cy - r - 8);
        }
      }

      // ── Stats ──
      ctx.fillStyle = "rgba(140,160,200,0.08)";
      ctx.font = '7px "Noto Sans SC", sans-serif';
      ctx.textAlign = "right";
      const label = PHASE_LABELS[state.phase] || state.phase;
      ctx.fillText(
        label + " · 相干 " + Math.round(state.systemCoherence * 100).toString() + "% · " + visibleNodes.length.toString() + " nodes",
        cw - 10, ch - 8,
      );

      requestAnimationFrame(render);
    };

    requestAnimationFrame(render);
    return () => { running = false; };
  }, [state]);

  if (!state?.nodes.length) return null;

  const visibleNodes: DissolutionNode[] = state.nodes.filter((n: DissolutionNode) => !n.dissolved);

  return (
    <div className="absolute inset-0">
      <canvas ref={canvasRef} className="absolute inset-0" style={{ width: "100%", height: "100%" }} />
      {visibleNodes.map((node: DissolutionNode) => (
        <div
          key={node.id}
          className="absolute"
          style={{
            left: node.x.toString() + "%", top: node.y.toString() + "%",
            transform: "translate(-50%, -50%)",
            width: 24, height: 24, borderRadius: "50%",
            cursor: node.coherence > 0.2 ? "pointer" : "default",
            zIndex: 15,
            opacity: node.opacity * 0.01,
          }}
          onClick={() => { if (node.coherence > 0.2) onNodeClick(node.id); }}
        />
      ))}
    </div>
  );
}