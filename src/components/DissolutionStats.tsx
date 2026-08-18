"use client";
import { motion } from "framer-motion";
import type { DissolutionState, DissolutionNode } from "../lib/ecosystem/DissolutionEngine";

interface Props {
  state: DissolutionState;
  personalityTone: string;
  closenessPct: number;
}

const PHASE_INFO: Record<string, { label: string; color: string }> = {
  stable: { label: "稳定", color: "rgba(140,200,240,0.5)" },
  drifting: { label: "漂移中", color: "rgba(200,180,140,0.5)" },
  fragmenting: { label: "碎裂", color: "rgba(220,140,120,0.5)" },
  dissolving: { label: "消散", color: "rgba(160,120,200,0.5)" },
  void: { label: "虚空", color: "rgba(80,80,120,0.5)" },
};

export default function DissolutionStats({ state, personalityTone, closenessPct }: Props) {
  const info = PHASE_INFO[state.phase] || PHASE_INFO.stable;
  const activeNodes = state.nodes.filter((n: DissolutionNode) => !n.dissolved).length;

  return (
    <div className="flex items-center gap-6 px-6 py-3" style={{ pointerEvents: "none" }}>
      <div className="flex items-center gap-2">
        <motion.div
          animate={{
            opacity: state.phase === "fragmenting" ? [0.2, 0.6, 0.2] : 0.5,
            scale: state.phase === "dissolving" ? [1, 0.6, 1] : 1,
          }}
          transition={{ duration: state.phase === "dissolving" ? 1.5 : 3, repeat: Infinity }}
          className="w-2 h-2 rounded-full"
          style={{ background: info.color }}
        />
        <span style={{ fontSize: 10, color: "rgba(180,170,150,0.3)", letterSpacing: "0.08em" }}>
          {info.label}
        </span>
      </div>

      <div className="flex items-center gap-1.5">
        <span style={{ fontSize: 8, color: "rgba(160,150,140,0.18)" }}>相干</span>
        <div style={{ width: 48, height: 2, borderRadius: 1, background: "rgba(255,255,255,0.04)" }}>
          <motion.div
            animate={{ width: (state.systemCoherence * 100).toString() + "%" }}
            transition={{ duration: 2 }}
            style={{ height: "100%", borderRadius: 1, background: info.color }}
          />
        </div>
      </div>

      <span style={{ fontSize: 8, color: "rgba(160,150,140,0.15)" }}>
        {activeNodes}/{state.nodes.length} nodes
      </span>

      <div className="flex items-center gap-1.5">
        <span style={{ fontSize: 8, color: "rgba(160,150,140,0.18)" }}>互动记录</span>
        <div style={{ width: 36, height: 2, borderRadius: 1, background: "rgba(255,255,255,0.04)" }}>
          <motion.div
            animate={{ width: closenessPct.toString() + "%" }}
            transition={{ duration: 3 }}
            style={{ height: "100%", borderRadius: 1, background: "rgba(200,160,120,0.4)" }}
          />
        </div>
      </div>

      <span style={{ fontSize: 7, color: "rgba(160,150,140,0.1)", fontFamily: "monospace" }}>
        decay {state.decayRate.toFixed(5)}/tick
      </span>
    </div>
  );
}
