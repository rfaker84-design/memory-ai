"use client";
import { motion, AnimatePresence } from "framer-motion";

interface Props {
  fragments: Array<{ text: string; x: number; y: number; id: number }>;
}

export default function MemoryFragments({ fragments }: Props) {
  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden">
      <AnimatePresence>
        {fragments.map((f) => (
          <motion.p
            key={f.id}
            initial={{ opacity: 0, y: 20, filter: "blur(4px)" }}
            animate={{ opacity: 0.35, y: 0, filter: "blur(0px)" }}
            exit={{ opacity: 0, y: -15, filter: "blur(3px)" }}
            transition={{ duration: 1.6, ease: "easeInOut" }}
            style={{
              position: "absolute",
              left: `${f.x}%`,
              top: `${f.y}%`,
              fontSize: 14,
              fontWeight: 300,
              color: "rgba(200,185,160,0.35)",
              letterSpacing: "0.08em",
              maxWidth: 240,
              lineHeight: 1.8,
              margin: 0,
              fontStyle: "italic",
            }}
          >
            {f.text}
          </motion.p>
        ))}
      </AnimatePresence>
    </div>
  );
}