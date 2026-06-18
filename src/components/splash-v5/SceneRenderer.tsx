"use client";
import { motion, AnimatePresence } from "framer-motion";
import type { WorldScene, Weather } from "../../lib/world-types";
import { ATMOSPHERE_RENDER } from "../../lib/world-types";

interface Props {
  scene: WorldScene;
  active: boolean;
  weather: Weather;
  globalIntensity: number;
}

export default function SceneRenderer({ scene, active, weather, globalIntensity }: Props) {
  const atmos = ATMOSPHERE_RENDER[weather];
  const accentColor = atmos.lightColor;

  return (
    <AnimatePresence>
      {active && (
        <motion.div
          initial={{ opacity: 0, filter: "blur(12px)", scale: 1.08 }}
          animate={{ opacity: 1, filter: "blur(0px)", scale: 1 }}
          exit={{ opacity: 0, filter: "blur(8px)", scale: 0.95 }}
          transition={{ duration: 1.2, ease: "easeInOut" }}
          className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none"
          style={{ perspective: "1000px" }}
        >
          {/* Scene light bloom */}
          <motion.div
            animate={{
              opacity: [0.1, 0.3, 0.15] as any,
              scale: [0.9, 1.05, 0.95] as any,
            }}
            transition={{ duration: scene.duration, ease: "easeInOut", repeat: Infinity }}
            style={{
              position: "absolute",
              width: "60%",
              height: "40%",
              background: `radial-gradient(ellipse at center, ${accentColor}0.25), transparent 70%)`,
              filter: "blur(40px)",
            }}
          />

          {/* Memory fragment particles */}
          {Array.from({ length: 12 }, (_, i) => {
            const r = (s: number) => { let v = s; return () => { v = (v * 16807) % 2147483647; return v / 2147483647; }; };
            const rand = r(i * 77 + scene.id * 13);
            return (
              <motion.div
                key={"sf" + i}
                initial={{ opacity: 0, y: 0, x: 0 }}
                animate={{
                  opacity: [0, 0.5, 0.3, 0] as any,
                  y: -(30 + rand() * 80),
                  x: (rand() - 0.5) * 60,
                  scale: [0.5, 1, 0.8, 0.3] as any,
                }}
                transition={{
                  duration: 2 + rand() * 3,
                  delay: rand() * 1.5,
                  ease: "easeOut",
                  repeat: Infinity,
                  repeatDelay: rand() * 2,
                }}
                style={{
                  position: "absolute",
                  width: 2 + rand() * 4,
                  height: 2 + rand() * 4,
                  borderRadius: "50%",
                  background: `${accentColor}0.6)`,
                  top: 35 + rand() * 40 + "%",
                  left: 30 + rand() * 40 + "%",
                  filter: "blur(1px)",
                }}
              />
            );
          })}

          {/* Scene title */}
          <motion.h2
            initial={{ opacity: 0, y: 20, filter: "blur(4px)" }}
            animate={{ opacity: 0.75, y: 0, filter: "blur(0px)" }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.8, delay: 0.3 }}
            style={{
              fontSize: 26,
              fontWeight: 300,
              color: "rgba(255,255,255,0.75)",
              letterSpacing: "0.15em",
              textShadow: `0 0 40px ${atmos.lightColor}0.3)`,
              marginBottom: 16,
              zIndex: 10,
            }}
          >
            {scene.title}
          </motion.h2>

          {/* Scene description */}
          <motion.p
            initial={{ opacity: 0, y: 12, filter: "blur(2px)" }}
            animate={{ opacity: 0.45, y: 0, filter: "blur(0px)" }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.8, delay: 0.6 }}
            style={{
              fontSize: 14,
              fontWeight: 300,
              color: "rgba(255,255,255,0.45)",
              letterSpacing: "0.08em",
              maxWidth: "70%",
              textAlign: "center",
              lineHeight: 1.7,
              zIndex: 10,
            }}
          >
            {scene.description}
          </motion.p>

          {/* Narration */}
          <motion.p
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 0.55 * globalIntensity, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 1, delay: 1 }}
            style={{
              fontSize: 15,
              fontWeight: 300,
              color: "rgba(255,235,200,0.55)",
              letterSpacing: "0.1em",
              textShadow: `0 0 20px ${accentColor}0.25)`,
              marginTop: 24,
              padding: "0 48px",
              textAlign: "center",
              lineHeight: 1.8,
              zIndex: 10,
            }}
          >
            {scene.narration}
          </motion.p>
        </motion.div>
      )}
    </AnimatePresence>
  );
}