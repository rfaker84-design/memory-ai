"use client";
import { motion } from "framer-motion";

interface Props {
  name: string;
}

export default function MemoryFieldBackground({ name }: Props) {
  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden" style={{ background: "#08060e" }}>
      {/* Central warm bloom */}
      <motion.div
        animate={{ opacity: [0.15, 0.3, 0.15], scale: [1, 1.05, 1] }}
        transition={{ duration: 8, repeat: Infinity, ease: "easeInOut" }}
        style={{
          position: "absolute",
          top: "40%", left: "50%",
          width: "60%", height: "50%",
          transform: "translate(-50%, -50%)",
          borderRadius: "50%",
          background: "radial-gradient(ellipse at center, rgba(180,150,100,0.18) 0%, transparent 60%)",
          filter: "blur(60px)",
        }}
      />

      {/* Secondary cool glow */}
      <motion.div
        animate={{ opacity: [0.08, 0.18, 0.08], scale: [1, 1.03, 1] }}
        transition={{ duration: 12, repeat: Infinity, ease: "easeInOut", delay: 3 }}
        style={{
          position: "absolute",
          bottom: "20%", right: "10%",
          width: "45%", height: "40%",
          borderRadius: "50%",
          background: "radial-gradient(ellipse at center, rgba(120,140,200,0.12) 0%, transparent 60%)",
          filter: "blur(50px)",
        }}
      />

      {/* Subtle dust particles */}
      {Array.from({ length: 20 }, (_, i) => {
        const s = ((i * 16807 + 1) % 2147483647) / 2147483647;
        return (
          <motion.div
            key={i}
            animate={{ opacity: [0, 0.12, 0], y: [0, -30, 0] }}
            transition={{
              duration: 8 + s * 14, repeat: Infinity, delay: s * 8, ease: "easeInOut",
            }}
            style={{
              position: "absolute",
              left: `${20 + s * 60}%`, top: `${30 + s * 40}%`,
              width: 1 + s * 2, height: 1 + s * 2,
              borderRadius: "50%",
              background: "rgba(180,160,140,0.3)",
            }}
          />
        );
      })}

      {/* Name whisper in background */}
      <motion.p
        initial={{ opacity: 0 }}
        animate={{ opacity: 0.04 }}
        transition={{ delay: 2, duration: 3 }}
        className="absolute inset-0 flex items-center justify-center select-none"
        style={{
          fontSize: "min(12vw, 120px)",
          fontWeight: 300,
          color: "rgba(200,180,150,0.04)",
          letterSpacing: "0.15em",
          pointerEvents: "none",
        }}
      >
        {name}
      </motion.p>
    </div>
  );
}