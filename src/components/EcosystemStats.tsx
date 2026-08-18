"use client";
import { motion } from "framer-motion";
import type { EvolutionEvent } from "../lib/ecosystem/EvolutionEngine";

interface Props {
  dominance: string;
  stabilityIndex: number;
  pressure: number;
  nodeCount: number;
  events: EvolutionEvent[];
  personalityTone: string;
  closenessPct: number;
}

const MODE_LABELS: Record<string, { label: string; color: string }> = {
  stable: { label: "稳定态", color: "rgba(140,200,240,0.5)" },
  evolving: { label: "演化态", color: "rgba(255,200,120,0.5)" },
  volatile: { label: "活跃态", color: "rgba(255,140,120,0.5)" },
  collapsing: { label: "衰减态", color: "rgba(120,120,160,0.5)" },
};

export default function EcosystemStats({ dominance, stabilityIndex, pressure, nodeCount, events, personalityTone, closenessPct }: Props) {
  const mode = MODE_LABELS[dominance] || MODE_LABELS.stable;

  return (
    <div className="flex items-center gap-6 px-6 py-3" style={{ pointerEvents: "none" }}>
      {/* Dominance mode indicator */}
      <div className="flex items-center gap-2">
        <motion.div
          animate={{ opacity: dominance === "volatile" ? [0.3, 0.7, 0.3] : 0.5 }}
          transition={{ duration: 2, repeat: Infinity }}
          className="w-2 h-2 rounded-full"
          style={{ background: mode.color }}
        />
        <span style={{ fontSize: 10, color: "rgba(180,170,150,0.3)", letterSpacing: "0.08em" }}>
          {mode.label}
        </span>
      </div>

      {/* Stability bar */}
      <div className="flex items-center gap-1.5">
        <span style={{ fontSize: 8, color: "rgba(160,150,140,0.18)" }}>稳定</span>
        <div style={{ width: 40, height: 2, borderRadius: 1, background: "rgba(255,255,255,0.04)" }}>
          <motion.div
            animate={{ width: `${stabilityIndex * 100}%` }}
            transition={{ duration: 2 }}
            style={{ height: "100%", borderRadius: 1, background: mode.color }}
          />
        </div>
      </div>

      {/* Pressure bar */}
      <div className="flex items-center gap-1.5">
        <span style={{ fontSize: 8, color: "rgba(160,150,140,0.18)" }}>压力</span>
        <div style={{ width: 40, height: 2, borderRadius: 1, background: "rgba(255,255,255,0.04)" }}>
          <motion.div
            animate={{ width: `${pressure * 100}%` }}
            transition={{ duration: 2 }}
            style={{ height: "100%", borderRadius: 1, background: "rgba(255,160,120,0.4)" }}
          />
        </div>
      </div>

      {/* Node count */}
      <span style={{ fontSize: 8, color: "rgba(160,150,140,0.15)" }}>
        {nodeCount} nodes
      </span>

      {/* Closeness */}
      <div className="flex items-center gap-1.5">
        <span style={{ fontSize: 8, color: "rgba(160,150,140,0.18)" }}>互动记录</span>
        <div style={{ width: 36, height: 2, borderRadius: 1, background: "rgba(255,255,255,0.04)" }}>
          <motion.div
            animate={{ width: `${closenessPct}%` }}
            transition={{ duration: 3 }}
            style={{ height: "100%", borderRadius: 1, background: "rgba(200,160,120,0.4)" }}
          />
        </div>
      </div>

      {/* Latest event */}
      {events.length > 0 && (
        <motion.span
          key={events[0].description}
          initial={{ opacity: 0 }}
          animate={{ opacity: 0.25 }}
          className="text-[8px] ml-auto"
          style={{ color: "rgba(180,200,220,0.25)", letterSpacing: "0.04em" }}
        >
          {events[0].description}
        </motion.span>
      )}
    </div>
  );
}
