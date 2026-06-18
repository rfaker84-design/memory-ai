"use client";
import { useRef, useEffect, useMemo } from "react";
import { motion } from "framer-motion";
import type { EcosystemState, EvolutionEvent } from "../lib/ecosystem/EvolutionEngine";

interface Props {
  ecosystem: EcosystemState | null;
  events: EvolutionEvent[];
  dominance: string;
  stabilityIndex: number;
  onNodeClick: (id: string) => void;
  onNodeHover: (id: string | null) => void;
}

const STAGE_COLORS: Record<number, string> = {
  0: "rgba(140,170,210,", 1: "rgba(255,180,100,", 2: "rgba(200,140,220,", 3: "rgba(140,220,180,", 4: "rgba(100,100,140,",
};

const STAGE_LABELS: Record<number, string> = { 0: "stable", 1: "evolving", 2: "merging", 3: "splitting", 4: "fading" };
const DOMINANCE_COLORS: Record<string, string> = {
  stable: "rgba(140,200,240,", evolving: "rgba(255,200,120,", volatile: "rgba(255,120,120,", collapsing: "rgba(100,100,140,",
};

export default function EvolvingNetworkViewV7({ ecosystem, events, dominance, stabilityIndex, onNodeClick, onNodeHover }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const prevNodesRef = useRef<Map<string, { x: number; y: number }>>(new Map());
  const pulsePhaseRef = useRef(0);

  // ─── Canvas render loop ────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !ecosystem?.nodes.length) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let running = true;
    const prevNodes = prevNodesRef.current;

    const render = () => {
      if (!running) return;
      pulsePhaseRef.current += 0.02;

      const W = canvas.width = canvas.offsetWidth * devicePixelRatio;
      const H = canvas.height = canvas.offsetHeight * devicePixelRatio;
      ctx.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
      const cw = canvas.offsetWidth;
      const ch = canvas.offsetHeight;
      const nodes = ecosystem.nodes;

      // Dim clear for trail effect
      ctx.fillStyle = "rgba(4,6,16,0.12)";
      ctx.fillRect(0, 0, cw, ch);

      const domColor = DOMINANCE_COLORS[dominance] || DOMINANCE_COLORS.stable;

      // ── Background pulse based on dominance ──
      const pulseAlpha = 0.015 + Math.sin(pulsePhaseRef.current) * 0.008 + stabilityIndex * 0.01;
      const bgGlow = ctx.createRadialGradient(cw / 2, ch / 2, 0, cw / 2, ch / 2, cw * 0.6);
      bgGlow.addColorStop(0, `${domColor}${pulseAlpha})`);
      bgGlow.addColorStop(1, "transparent");
      ctx.fillStyle = bgGlow;
      ctx.fillRect(0, 0, cw, ch);

      // ── Connections with flow pulse ──
      for (const node of nodes) {
        const prevPos = prevNodes.get(node.id);
        if (prevPos) {
          // Interpolate for smooth movement
          node.x = prevPos.x + (node.x - prevPos.x) * 0.3;
          node.y = prevPos.y + (node.y - prevPos.y) * 0.3;
        }
        prevNodes.set(node.id, { x: node.x, y: node.y });

        for (const conn of node.connections) {
          const target = nodes.find(n => n.id === conn.to);
          if (!target) continue;
          const ax = (node.x / 100) * cw;
          const ay = (node.y / 100) * ch;
          const bx = (target.x / 100) * cw;
          const by = (target.y / 100) * ch;

          // Flowing light on connection
          const flowOffset = (pulsePhaseRef.current * 30 + ax + ay) % 1;
          const gradient = ctx.createLinearGradient(ax, ay, bx, by);
          const connAlpha = 0.05 + conn.strength * 0.12;

          // Draw multiple passes for glow
          for (let pass = 0; pass < 2; pass++) {
            ctx.beginPath();
            ctx.moveTo(ax, ay);
            ctx.lineTo(bx, by);
            const alpha = pass === 0 ? connAlpha * 0.5 : connAlpha;
            ctx.strokeStyle = `rgba(120,150,200,${alpha})`;
            ctx.lineWidth = pass === 0 ? 1.5 + conn.strength * 2 : 0.3 + conn.strength * 0.8;
            ctx.stroke();
          }

          // Flow dot
          const dotX = ax + (bx - ax) * flowOffset;
          const dotY = ay + (by - ay) * flowOffset;
          ctx.beginPath();
          ctx.arc(dotX, dotY, 1.2 + conn.strength * 1.5, 0, Math.PI * 2);
          ctx.fillStyle = `rgba(180,200,240,${0.3 + conn.strength * 0.4})`;
          ctx.fill();
        }
      }

      // ── Nodes ──
      for (const node of nodes) {
        const cx = (node.x / 100) * cw;
        const cy = (node.y / 100) * ch;
        const r = 3 + node.mass * 7 + node.energy * 2;
        const color = STAGE_COLORS[node.mutationStage] || STAGE_COLORS[0];
        const alpha = node.mutationStage === 4 ? 0.25 : 0.5 + node.energy * 0.45;
        const isFocus = node.id === ecosystem.focusId;

        // Pulsing for evolving nodes
        const pulseScale = node.mutationStage === 1
          ? 1 + Math.sin(pulsePhaseRef.current * 3 + node.x) * 0.2
          : 1;

        // Outer glow
        const glowR = r * (isFocus ? 3.5 : 2.2) * pulseScale;
        const glow = ctx.createRadialGradient(cx, cy, r * 0.2, cx, cy, glowR);
        glow.addColorStop(0, `${color}${alpha * 0.4})`);
        glow.addColorStop(1, "transparent");
        ctx.fillStyle = glow;
        ctx.beginPath();
        ctx.arc(cx, cy, glowR, 0, Math.PI * 2);
        ctx.fill();

        // Core
        const coreGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
        coreGrad.addColorStop(0, "rgba(245,248,255,0.95)");
        coreGrad.addColorStop(0.5, `${color}0.7)`);
        coreGrad.addColorStop(1, `${color}0.3)`);
        ctx.fillStyle = coreGrad;
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.fill();

        // Focus ring
        if (isFocus) {
          ctx.strokeStyle = `${domColor}${0.3 + Math.sin(pulsePhaseRef.current) * 0.1})`;
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.arc(cx, cy, r + 6, 0, Math.PI * 2);
          ctx.stroke();
        }

        // Label
        if (isFocus || node.mutationStage === 1) {
          ctx.fillStyle = isFocus ? "rgba(220,235,250,0.55)" : "rgba(180,200,220,0.3)";
          ctx.font = `${isFocus ? 10 : 7}px "Noto Sans SC", sans-serif`;
          ctx.textAlign = "center";
          ctx.fillText(node.name, cx, cy - r - 10);
        }

        // Mutation stage indicator
        if (node.mutationStage !== 0) {
          ctx.fillStyle = `${color}0.15)`;
          ctx.font = '6px "Noto Sans SC", sans-serif';
          ctx.textAlign = "center";
          ctx.fillText(STAGE_LABELS[node.mutationStage], cx, cy + r + 12);
        }
      }

      // ── Stats overlay ──
      ctx.fillStyle = "rgba(140,160,200,0.1)";
      ctx.font = '8px "Noto Sans SC", sans-serif';
      ctx.textAlign = "right";
      const modeLabel = { stable: "稳定", evolving: "演化中", volatile: "活跃", collapsing: "衰减" }[dominance] || dominance;
      ctx.fillText(`tick ${ecosystem.tick} · ${modeLabel} · 稳定 ${Math.round(stabilityIndex * 100)}%`, cw - 12, ch - 10);
      ctx.fillText(`nodes ${nodes.length} · pressure ${Math.round(ecosystem.environmentalPressure * 100)}%`, cw - 12, ch - 22);

      requestAnimationFrame(render);
    };

    requestAnimationFrame(render);
    return () => { running = false; };
  }, [ecosystem, dominance, stabilityIndex]);

  // ─── Cluster clouds (CSS overlay) ──────────────────────────
  const clusterClouds = useMemo(() => {
    if (!ecosystem) return [];
    const clusters = new Map<string, { x: number; y: number; count: number; tag: string }>();
    for (const node of ecosystem.nodes) {
      const tag = node.clusterTag || "ungrouped";
      const existing = clusters.get(tag);
      if (existing) {
        existing.x += node.x;
        existing.y += node.y;
        existing.count++;
      } else {
        clusters.set(tag, { x: node.x, y: node.y, count: 1, tag });
      }
    }
    return [...clusters.values()]
      .filter(c => c.count >= 2)
      .map(c => ({ x: c.x / c.count, y: c.y / c.count, count: c.count, tag: c.tag }));
  }, [ecosystem]);

  if (!ecosystem?.nodes.length) return null;

  return (
    <div className="absolute inset-0">
      <canvas ref={canvasRef} className="absolute inset-0" style={{ width: "100%", height: "100%" }} />

      {/* Cluster clouds */}
      {clusterClouds.map((cluster) => (
        <div
          key={cluster.tag}
          className="absolute pointer-events-none"
          style={{
            left: `${cluster.x}%`, top: `${cluster.y}%`,
            transform: "translate(-50%, -50%)",
            width: Math.min(120, 40 + cluster.count * 12),
            height: Math.min(80, 30 + cluster.count * 8),
            borderRadius: "50%",
            background: `radial-gradient(ellipse, rgba(140,180,220,0.04) 0%, transparent 70%)`,
            filter: "blur(15px)",
          }}
        />
      ))}

      {/* Invisible click targets */}
      {ecosystem.nodes.map((node) => (
        <div
          key={node.id}
          className="absolute"
          style={{
            left: `${node.x}%`, top: `${node.y}%`,
            transform: "translate(-50%, -50%)",
            width: 28, height: 28, borderRadius: "50%",
            cursor: node.mutationStage === 4 ? "default" : "pointer",
            zIndex: 15,
            opacity: node.mutationStage === 4 ? 0.4 : 1,
          }}
          onClick={() => { if (node.mutationStage !== 4) onNodeClick(node.id); }}
          onMouseEnter={() => onNodeHover(node.id)}
          onMouseLeave={() => onNodeHover(null)}
        />
      ))}

      {/* Active events feed */}
      {events.length > 0 && (
        <div className="absolute bottom-4 left-4 z-20 pointer-events-none">
          {events.slice(0, 3).map((evt, i) => (
            <motion.div
              key={`${evt.tick}-${i}`}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.4 }}
              className="text-[9px] mb-0.5"
              style={{ color: "rgba(160,180,210,0.3)", letterSpacing: "0.04em" }}
            >
              {evt.description}
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
}
