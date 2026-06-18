"use client";
import { motion } from "framer-motion";

export default function SkipButton({ onSkip, visible }: { onSkip: () => void; visible: boolean }) {
  return (
    <motion.button
      initial={{ opacity: 0 }}
      animate={{ opacity: visible ? 0.5 : 0 }}
      whileHover={{ opacity: 0.9 }}
      onClick={onSkip}
      className="absolute top-6 right-6 z-30"
      style={{ background: "transparent", border: "1px solid rgba(255,255,255,0.15)", borderRadius: 20, padding: "6px 16px", color: "rgba(255,255,255,0.6)", fontSize: 13, cursor: "pointer", backdropFilter: "blur(8px)" }}
    >
      跳过
    </motion.button>
  );
}
