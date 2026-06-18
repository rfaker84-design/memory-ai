"use client";
import { useMemo } from "react";
import { motion } from "framer-motion";
import type { EmotionType } from "../../lib/scene-types";
import { EMOTION_PALETTES, EMOTION_STAR_DENSITY } from "../../lib/scene-types";

function sr(s: number) {
  let v = s;
  return () => { v = (v * 16807) % 2147483647; return v / 2147483647; };
}

interface Props {
  emotion: EmotionType;
  progress: number;
  intensity: number;
}

export default function EmotionStarField({ emotion, progress, intensity }: Props) {
  const palette = EMOTION_PALETTES[emotion];
  const density = EMOTION_STAR_DENSITY[emotion];

  const layers = useMemo(() => {
    const makeLayer = (count: number, sizeRange: [number, number], alphaBase: number) => {
      const stars: { x: number; y: number; s: number; d: number; br: number }[] = [];
      const [sMin, sMax] = sizeRange;
      for (let i = 0; i < count; i++) {
        const r = sr(i * 199 + (emotion === "warm" ? 77 : emotion === "sad" ? 13 : emotion === "peaceful" ? 41 : 59));
        stars.push({
          x: r() * 100,
          y: r() * 45,
          s: sMin + r() * (sMax - sMin),
          d: r() * 3,
          br: alphaBase + r() * 0.3,
        });
      }
      return stars;
    };

    return {
      far: makeLayer(density.far, [0.3, 0.8], 0.15),
      mid: makeLayer(density.mid, [0.7, 1.5], 0.2),
      near: makeLayer(density.near, [1.2, 2.8], 0.3),
    };
  }, [emotion, density]);

  const adjustedIntensity = intensity * 0.7 + 0.3;

  return (
    <div className="absolute inset-0 pointer-events-none">
      {/* Far layer */}
      <motion.div animate={{ opacity: progress < 0.3 ? progress / 0.3 : 1 * adjustedIntensity }}>
        {layers.far.map((s, i) => (
          <div
            key={"ef" + i}
            style={{
              position: "absolute",
              left: s.x + "%",
              top: s.y + "%",
              width: s.s,
              height: s.s,
              borderRadius: "50%",
              background: palette.stars + (s.br * adjustedIntensity) + ")",
              transform: "translateY(" + (progress * s.d * 1.5) + "px)",
              willChange: "transform, opacity",
            }}
          />
        ))}
      </motion.div>

      {/* Mid layer */}
      <motion.div animate={{ opacity: progress < 0.5 ? progress / 0.5 : 1 * adjustedIntensity }}>
        {layers.mid.map((s, i) => (
          <div
            key={"em" + i}
            style={{
              position: "absolute",
              left: s.x + "%",
              top: s.y + "%",
              width: s.s,
              height: s.s,
              borderRadius: "50%",
              background: palette.stars + (s.br * adjustedIntensity) + ")",
              boxShadow: "0 0 " + s.s + "px " + palette.stars + (s.br * 0.6) + ")",
              transform: "translateY(" + (progress * s.d * 3) + "px)",
              willChange: "transform, opacity",
            }}
          />
        ))}
      </motion.div>

      {/* Near layer �� warm glow */}
      <motion.div animate={{ opacity: progress < 0.6 ? progress / 0.6 : 1 * adjustedIntensity }}>
        {layers.near.map((s, i) => (
          <div
            key={"en" + i}
            style={{
              position: "absolute",
              left: s.x + "%",
              top: s.y + "%",
              width: s.s,
              height: s.s,
              borderRadius: "50%",
              background: palette.stars + (s.br * adjustedIntensity) + ")",
              boxShadow: "0 0 " + (s.s * 2) + "px " + s.s + "px " + palette.stars + (s.br) + ")",
              transform: "translateY(" + (progress * s.d * 5) + "px)",
              willChange: "transform, opacity",
            }}
          />
        ))}
      </motion.div>
    </div>
  );
}