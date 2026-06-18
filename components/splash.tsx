"use client";

import { useEffect, useState, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";

/* Seeded random — deterministic across server/client, prevents hydration mismatch */
function createRng(seed: number) {
  let s = seed;
  return () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; };
}

/*
  忆见 Memory AI — Mobile-First Splash V2
  ≤ 2 seconds. High contrast. Pure white glowing text. Deep rich gradient.
*/

export default function Splash({ onDone }: { onDone: () => void }) {
  const [exiting, setExiting] = useState(false);

  const motes = useMemo(() => {
    const r = createRng(1337);
    return [...Array(12)].map(() => ({
      width: 2 + r() * 4,
      height: 2 + r() * 4,
      left: 6 + r() * 88,
      top: 8 + r() * 84,
      animDuration: 5 + r() * 5,
      animDelay: r() * 3,
    }));
  }, []);

  useEffect(() => {
    const t = setTimeout(() => {
      setExiting(true);
      setTimeout(() => onDone(), 600);
    }, 2000);
    return () => clearTimeout(t);
  }, [onDone]);

  return (
    <AnimatePresence>
      {!exiting && (
        <motion.div
          key="splash"
          exit={{ opacity: 0 }}
          transition={{ duration: 0.6, ease: "easeOut" }}
          className="fixed inset-0 z-50 flex items-center justify-center overflow-hidden"
          style={{
            background:
              "linear-gradient(170deg, #0a0814 0%, #0b0b0f 35%, #0e0c18 100%)",
          }}
        >
          {/* Layer 1: Strong breathing radial glow */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: [0.35, 0.65, 0.35] }}
            transition={{
              duration: 4,
              repeat: Infinity,
              ease: "easeInOut",
            }}
            className="absolute inset-0 pointer-events-none"
            style={{
              background:
                "radial-gradient(ellipse at 50% 32%, rgba(160,130,210,0.18) 0%, transparent 55%), radial-gradient(ellipse at 50% 72%, rgba(200,150,90,0.08) 0%, transparent 50%)",
            }}
          />

          {/* Layer 2: Floating light motes (deterministic) */}
          <div className="absolute inset-0 pointer-events-none">
            {motes.map((m, i) => (
              <motion.div
                key={i}
                className="absolute rounded-full"
                style={{
                  width: m.width,
                  height: m.height,
                  background: "rgba(220,200,230,0.4)",
                  left: `${m.left}%`,
                  top: `${m.top}%`,
                }}
                animate={{
                  y: [0, -24, -12, 0],
                  opacity: [0, 0.45, 0.2, 0],
                }}
                transition={{
                  duration: m.animDuration,
                  delay: m.animDelay,
                  repeat: Infinity,
                }}
              />
            ))}
          </div>

          {/* Layer 3: Text — pure white, strong glow */}
          <div
            className="flex flex-col items-center"
            style={{
              zIndex: 10,
              paddingLeft: "max(24px, env(safe-area-inset-left))",
              paddingRight: "max(24px, env(safe-area-inset-right))",
              paddingTop: "env(safe-area-inset-top, 24px)",
              paddingBottom: "env(safe-area-inset-bottom, 24px)",
              maxWidth: "92vw",
            }}
          >
            <motion.h1
              initial={{ opacity: 0, y: 20, filter: "blur(12px)" }}
              animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
              transition={{
                duration: 0.8,
                delay: 0.3,
                ease: [0.25, 0.1, 0.25, 1.0],
              }}
              className="text-center font-bold leading-none select-none"
              style={{
                fontSize: "clamp(44px, 17vw, 80px)",
                fontWeight: 800,
                color: "#FFFFFF",
                letterSpacing: "0.08em",
                margin: 0,
                textShadow:
                  "0 0 40px rgba(255,255,255,0.35), 0 0 80px rgba(200,170,255,0.22), 0 0 140px rgba(160,130,220,0.15), 0 0 200px rgba(140,110,200,0.08), 0 4px 8px rgba(0,0,0,0.6)",
              }}
            >
              忆见
            </motion.h1>

            <motion.p
              initial={{ opacity: 0, y: 10, filter: "blur(8px)" }}
              animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
              transition={{
                duration: 0.6,
                delay: 0.7,
                ease: "easeOut",
              }}
              className="text-center font-light select-none"
              style={{
                marginTop: "clamp(20px, 6vh, 36px)",
                fontSize: "clamp(16px, 5vw, 22px)",
                fontWeight: 400,
                color: "#D8D4E8",
                letterSpacing: "0.22em",
                marginLeft: 0,
                marginRight: 0,
                marginBottom: 0,
                textShadow:
                  "0 0 20px rgba(200,190,230,0.3), 0 0 50px rgba(180,160,220,0.12), 0 2px 4px rgba(0,0,0,0.5)",
              }}
            >
              让思念有回音
            </motion.p>

            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{
                duration: 0.5,
                delay: 1.0,
              }}
              className="text-center select-none"
              style={{
                marginTop: "clamp(12px, 3.5vh, 20px)",
                fontSize: "clamp(11px, 3.2vw, 14px)",
                fontWeight: 300,
                color: "rgba(180,175,195,0.45)",
                letterSpacing: "0.18em",
                marginLeft: 0,
                marginRight: 0,
                marginBottom: 0,
              }}
            >
              Memory creates encounters
            </motion.p>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}