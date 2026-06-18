"use client";
import { motion } from "framer-motion";
import type { Weather } from "../../lib/world-types";
import { ATMOSPHERE_RENDER } from "../../lib/world-types";

interface Props {
  visible: boolean;
  weather: Weather;
  onEnter: () => void;
  onSkip: () => void;
  canEnter: boolean;
  currentScene: number;
  totalScenes: number;
}

export default function InteractiveEntry({
  visible, weather, onEnter, onSkip, canEnter, currentScene, totalScenes,
}: Props) {
  const atmos = ATMOSPHERE_RENDER[weather];
  const borderColor = atmos.lightColor;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{
        opacity: visible ? 1 : 0,
        y: visible ? 0 : 20,
      }}
      transition={{ duration: 0.6, ease: "easeOut" }}
      className="absolute bottom-12 left-0 right-0 flex flex-col items-center gap-4 z-30"
      style={{ pointerEvents: visible ? "auto" : "none" }}
    >
      {/* Scene indicator */}
      <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
        {Array.from({ length: totalScenes }, (_, i) => (
          <motion.div
            key={"dot" + i}
            animate={{
              scale: i === currentScene ? 1.3 : 0.8,
              opacity: i <= currentScene ? 0.8 : 0.2,
            }}
            style={{
              width: 6,
              height: 6,
              borderRadius: "50%",
              background: i === currentScene ? atmos.lightColor + "0.9)" : "rgba(255,255,255,0.3)",
              boxShadow: i === currentScene ? `0 0 8px ${atmos.lightColor}0.5)` : "none",
              transition: "all 0.4s ease",
            }}
          />
        ))}
      </div>

      {/* Buttons */}
      <div style={{ display: "flex", gap: 16 }}>
        {/* Skip button */}
        <motion.button
          whileHover={{ scale: 1.03, opacity: 0.9 }}
          whileTap={{ scale: 0.97 }}
          onClick={onSkip}
          style={{
            background: "transparent",
            border: `1px solid rgba(255,255,255,0.12)`,
            borderRadius: 24,
            padding: "10px 28px",
            color: "rgba(255,255,255,0.45)",
            fontSize: 14,
            fontWeight: 300,
            cursor: "pointer",
            backdropFilter: "blur(12px)",
            letterSpacing: "0.08em",
          }}
        >
          跳过
        </motion.button>

        {/* Enter button */}
        <motion.button
          whileHover={canEnter ? { scale: 1.05, boxShadow: `0 0 30px ${atmos.lightColor}0.3)` } : {}}
          whileTap={canEnter ? { scale: 0.97 } : {}}
          onClick={canEnter ? onEnter : undefined}
          animate={{
            opacity: canEnter ? 1 : 0.4,
            boxShadow: canEnter
              ? `0 0 20px ${atmos.lightColor}0.2), 0 0 60px ${atmos.lightColor}0.08)`
              : "none",
          }}
          style={{
            background: canEnter
              ? `linear-gradient(135deg, ${atmos.lightColor}0.2), ${atmos.lightColor}0.05))`
              : "rgba(255,255,255,0.04)",
            border: `1px solid ${canEnter ? atmos.lightColor + "0.3)" : "rgba(255,255,255,0.08)"}`,
            borderRadius: 24,
            padding: "10px 32px",
            color: canEnter ? "rgba(255,255,255,0.85)" : "rgba(255,255,255,0.3)",
            fontSize: 14,
            fontWeight: 400,
            cursor: canEnter ? "pointer" : "default",
            backdropFilter: "blur(12px)",
            letterSpacing: "0.1em",
            transition: "all 0.5s ease",
          }}
        >
          {canEnter ? "进入记忆" : "准备中..."}
        </motion.button>
      </div>
    </motion.div>
  );
}