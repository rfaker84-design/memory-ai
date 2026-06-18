"use client";
import { useMemo } from "react";
import { motion } from "framer-motion";
import type { EntityVisuals, EntityMood } from "../../lib/entity-types";

function sr(s: number) { let v = s; return () => { v = (v * 16807) % 2147483647; return v / 2147483647; }; }

interface Props {
  visuals: EntityVisuals;
  mood: EntityMood;
  intensity: number;
  active: boolean;
}

export default function EntityPresence({ visuals, mood, intensity, active }: Props) {
  const breathe = Math.sin(Date.now() * 0.001 * visuals.breatheFrequency) * visuals.breatheAmplitude + (1 - visuals.breatheAmplitude);
  const glowOpacity = 0.3 * intensity * (0.7 + breathe * 0.3);

  const particles = useMemo(() =>
    Array.from({ length: Math.floor(visuals.particleDensity * 60) }, (_, i) => {
      const r = sr(i * 199 + 11);
      return { x: r() * 100, y: r() * 100, s: 1 + r() * 3, d: r() * 5, o: 0.15 + r() * 0.4 };
    }),
  [visuals.particleDensity]);

  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden">
      {/* 核心光晕 — 呼吸 */}
      <motion.div
        animate={{
          opacity: active ? glowOpacity : 0.05,
          scale: active ? 1 + (breathe - 0.75) * 0.3 : 0.8,
        }}
        transition={{ duration: 2, ease: "easeInOut" }}
        style={{
          position: "absolute",
          top: "30%", left: "50%",
          width: 300, height: 300,
          transform: "translate(-50%, -50%)",
          borderRadius: "50%",
          background: `radial-gradient(circle, ${visuals.glowColor}0.5), ${visuals.glowColor}0.2), transparent 65%)`,
          filter: `blur(${20 + visuals.blur * 10}px)`,
        }}
      />

      {/* 次级光晕 */}
      <motion.div
        animate={{
          opacity: active ? glowOpacity * 0.6 : 0,
          scale: active ? 1 + breathe * 0.2 : 0.7,
        }}
        transition={{ duration: 3, ease: "easeInOut" }}
        style={{
          position: "absolute",
          top: "35%", left: "48%",
          width: 200, height: 200,
          transform: "translate(-50%, -50%)",
          borderRadius: "50%",
          background: `radial-gradient(circle, ${visuals.glowColor}0.4), transparent 60%)`,
          filter: `blur(${10 + visuals.blur * 5}px)`,
        }}
      />

      {/* 粒子 */}
      {particles.map((p, i) => {
        const r = sr(i * 333);
        return (
          <motion.div
            key={"ep" + i}
            initial={{ opacity: 0 }}
            animate={{
              opacity: [0, p.o * intensity, p.o * intensity * 0.5, 0],
              x: [p.x + "%", (p.x + (r() - 0.5) * 25) + "%"],
              y: [p.y + "%", (p.y - 30 * p.d - (r() - 0.5) * 15) + "%"],
              scale: [0.5, 1, 0.8],
            }}
            transition={{
              duration: 3 + p.d * 4,
              delay: r() * 3,
              ease: "easeOut",
              repeat: Infinity,
              repeatDelay: r() * 2,
            }}
            style={{
              position: "absolute",
              width: p.s, height: p.s,
              borderRadius: "50%",
              background: `${visuals.particleColor}${p.o})`,
              boxShadow: `0 0 ${p.s * 3}px ${visuals.particleColor}0.4)`,
              filter: visuals.blur > 1 ? `blur(${visuals.blur * 0.3}px)` : "none",
            }}
          />
        );
      })}

      {/* 底层渐变 */}
      <div
        style={{
          position: "absolute", inset: 0,
          background: `radial-gradient(ellipse at 50% 35%, ${visuals.glowColor}0.08), transparent 60%)`,
          opacity: active ? intensity : 0,
          transition: "opacity 3s ease",
        }}
      />
    </div>
  );
}