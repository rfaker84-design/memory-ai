"use client";
import { useMemo } from "react";
import { motion } from "framer-motion";
import type { UniverseEntry, UniverseClusterNode } from "../../app/api/memory-multi-universe/route";

interface Props {
  universe: UniverseEntry;
  isActive: boolean;
  isDimmed: boolean;
  blendedEmotion: { attachment: number; curiosity: number; intensity: number };
  onClick: (universeId: string) => void;
  onNodeHover: (memoryId: string | null) => void;
}

/* ====================================================================
   Cluster color palette
   ==================================================================== */
const TYPE_COLORS: Record<string, { inner: string; mid: string; outer: string; label: string }> = {
  personal: { inner: "hsla(210,50%,60%,", mid: "hsla(210,40%,50%,", outer: "hsla(210,30%,30%,", label: "个人宇宙" },
  family:   { inner: "hsla(35,55%,60%,",  mid: "hsla(35,45%,50%,",  outer: "hsla(35,35%,30%,",  label: "家族宇宙" },
  shared:   { inner: "hsla(160,45%,55%,", mid: "hsla(160,35%,45%,", outer: "hsla(160,25%,25%,", label: "共享空间" },
};

/* ====================================================================
   Seed-based positioning within cluster
   ==================================================================== */
function clusterPositions(nodes: UniverseClusterNode[], colorHue: number) {
  return nodes.map((n, i) => {
    const angle = (i * 0.618033988749895) % 1 * Math.PI * 2;
    const dist = 18 + Math.sin(i * 1.7) * 10;
    return {
      x: 50 + Math.cos(angle) * dist,
      y: 35 + Math.sin(angle) * dist * 0.6,
      weight: n.emotional_weight,
      size: 3 + n.emotional_weight * 5 + (n.creator_weight || 0) * 3,
      glow: 0.2 + n.emotional_resonance * 0.5,
    };
  });
}

/* ====================================================================
   UniverseClusterView
   ==================================================================== */
export default function UniverseClusterView({
  universe, isActive, isDimmed, blendedEmotion, onClick, onNodeHover,
}: Props) {
  const colors = TYPE_COLORS[universe.type] || TYPE_COLORS.personal;
  const positions = useMemo(
    () => clusterPositions(universe.nodes, universe.color.hue),
    [universe.nodes, universe.color.hue]
  );

  const intensity = blendedEmotion.intensity || 0.5;
  const clusterScale = isActive ? 1.12 : isDimmed ? 0.85 : 1;
  const clusterOpacity = isDimmed ? 0.35 : 0.95;

  return (
    <motion.div
      animate={{ scale: clusterScale, opacity: clusterOpacity }}
      transition={{ duration: 0.5, ease: "easeOut" }}
      style={{
        position: "absolute",
        left: "50%", top: "50%",
        transform: "translate(-50%, -50%)",
        cursor: "pointer",
      }}
      onClick={() => onClick(universe.universe_id)}
      onMouseEnter={() => onNodeHover(universe.nodes[0]?.memory_id || null)}
      onMouseLeave={() => onNodeHover(null)}
    >
      {/* ================================================================
          Outer glow — universe halo
          ================================================================ */}
      <motion.div
        animate={{
          opacity: [0.12, 0.22, 0.12],
          scale: [1, 1.05, 1],
        }}
        transition={{ duration: 6 + Math.random() * 4, repeat: Infinity, ease: "easeInOut" }}
        style={{
          position: "absolute",
          left: "50%", top: "50%",
          width: 160, height: 120,
          transform: "translate(-50%, -50%)",
          borderRadius: "50%",
          background: `radial-gradient(ellipse at center, ${colors.inner}${0.25 * intensity}) 0%, transparent 65%)`,
          filter: "blur(25px)",
          pointerEvents: "none",
        }}
      />

      {/* ================================================================
          Mid ring — connection orbit
          ================================================================ */}
      <motion.div
        animate={{ rotate: 360 }}
        transition={{ duration: 40, repeat: Infinity, ease: "linear" }}
        style={{
          position: "absolute",
          left: "50%", top: "50%",
          width: 130, height: 90,
          transform: "translate(-50%, -50%)",
          borderRadius: "50%",
          border: `0.5px solid ${colors.mid}${0.15 * intensity})`,
          pointerEvents: "none",
        }}
      />

      {/* ================================================================
          Inner orbit (slower, reversed)
          ================================================================ */}
      <motion.div
        animate={{ rotate: -360 }}
        transition={{ duration: 30, repeat: Infinity, ease: "linear" }}
        style={{
          position: "absolute",
          left: "50%", top: "50%",
          width: 90, height: 65,
          transform: "translate(-50%, -50%)",
          borderRadius: "50%",
          border: `0.5px solid ${colors.inner}${0.2 * intensity})`,
          pointerEvents: "none",
        }}
      />

      {/* ================================================================
          Memory nodes — floating within cluster
          ================================================================ */}
      {positions.slice(0, 8).map((pos, i) => (
        <motion.div
          key={i}
          animate={{
            y: [0, -4, 0, 3, 0],
            opacity: [pos.glow, pos.glow * 1.4, pos.glow],
          }}
          transition={{
            duration: 3 + i * 0.5,
            repeat: Infinity,
            ease: "easeInOut",
            delay: i * 0.3,
          }}
          style={{
            position: "absolute",
            left: `${pos.x}%`, top: `${pos.y}%`,
            transform: "translate(-50%, -50%)",
            width: pos.size, height: pos.size,
            borderRadius: "50%",
            background: `${colors.inner}${0.6 + pos.weight * 0.4})`,
            boxShadow: `0 0 ${pos.size * 3}px ${colors.inner}${pos.glow}), 0 0 ${pos.size * 6}px ${colors.mid}${pos.glow * 0.5})`,
          }}
        />
      ))}

      {/* ================================================================
          Central core — universe heart
          ================================================================ */}
      <motion.div
        animate={{
          scale: isActive ? [1, 1.25, 1] : [1, 1.08, 1],
          opacity: isActive ? [0.6, 0.9, 0.6] : [0.35, 0.5, 0.35],
        }}
        transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
        style={{
          position: "absolute",
          left: "50%", top: "50%",
          width: 20, height: 20,
          transform: "translate(-50%, -50%)",
          borderRadius: "50%",
          background: `${colors.inner}0.8)`,
          boxShadow: `0 0 30px ${colors.inner}0.6), 0 0 60px ${colors.mid}0.3)`,
        }}
      />

      {/* ================================================================
          Label
          ================================================================ */}
      <div
        style={{
          position: "absolute",
          left: "50%", top: "105%",
          transform: "translateX(-50%)",
          textAlign: "center",
          pointerEvents: "none",
        }}
      >
        <p style={{
          fontSize: 11, margin: 0,
          color: `${colors.inner}${isActive ? 0.9 : 0.5})`,
          letterSpacing: "0.2em",
          fontWeight: 400,
        }}>
          {universe.label}
        </p>
        <p style={{
          fontSize: 9, margin: "3px 0 0",
          color: `${colors.outer}0.35)`,
          letterSpacing: "0.15em",
        }}>
          {universe.memberCount} 记忆
        </p>
      </div>
    </motion.div>
  );
}