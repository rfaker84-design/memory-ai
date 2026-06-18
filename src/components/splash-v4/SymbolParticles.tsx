"use client";
import { useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import type { EmotionType } from "../../lib/scene-types";
import { EMOTION_PALETTES } from "../../lib/scene-types";

function sr(s: number) {
  let v = s;
  return () => { v = (v * 16807) % 2147483647; return v / 2147483647; };
}

interface ParticleData {
  symbol: string;
  x: number;
  y: number;
  size: number;
  delay: number;
  duration: number;
  driftX: number;
  driftY: number;
}

interface Props {
  symbols: string[];
  emotion: EmotionType;
  active: boolean;
  fadeOut: boolean;
  intensity: number;
}

export default function SymbolParticles({ symbols, emotion, active, fadeOut, intensity }: Props) {
  const palette = EMOTION_PALETTES[emotion];

  const particles = useMemo<ParticleData[]>(() => {
    if (!symbols.length) return [];
    return symbols.flatMap((symbol, si) => {
      const r = sr(si * 777 + 13);
      // Each symbol appears 3-5 times at different positions
      const count = 3 + Math.floor(r() * 3);
      return Array.from({ length: count }, (_, i) => ({
        symbol,
        x: 15 + r() * 70,
        y: 20 + r() * 50,
        size: 10 + r() * 6,
        delay: si * 0.3 + r() * 1.5,
        duration: 6 + r() * 5,
        driftX: (r() - 0.5) * 60,
        driftY: -(20 + r() * 40),
      }));
    });
  }, [symbols]);

  return (
    <AnimatePresence>
      {active && !fadeOut && particles.length > 0 && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 0.55 * intensity }}
          exit={{ opacity: 0 }}
          className="absolute inset-0 pointer-events-none overflow-hidden"
        >
          {particles.map((p, i) => (
            <motion.div
              key={"sp" + i}
              initial={{
                opacity: 0,
                x: p.x + "%",
                y: p.y + "%",
                scale: 0.3,
                filter: "blur(4px)",
              }}
              animate={{
                opacity: [0, 0.45, 0.35, 0],
                x: (p.x + p.driftX) + "%",
                y: (p.y + p.driftY) + "%",
                scale: [0.3, 1, 0.9, 0.2],
                filter: ["blur(4px)", "blur(0px)", "blur(0px)", "blur(6px)"],
              }}
              transition={{
                duration: p.duration,
                delay: p.delay,
                ease: "easeInOut",
                repeat: Infinity,
                repeatDelay: 2 + Math.random() * 3,
              }}
              style={{
                position: "absolute",
                fontSize: p.size,
                fontWeight: 300,
                color: palette.accent,
                textShadow: "0 0 " + (p.size * 0.8) + "px " + palette.accent + ", 0 0 " + (p.size * 2) + "px " + palette.accent + "66",
                whiteSpace: "nowrap",
                letterSpacing: "0.05em",
              }}
            >
              {p.symbol}
            </motion.div>
          ))}
        </motion.div>
      )}
    </AnimatePresence>
  );
}