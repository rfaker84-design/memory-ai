"use client";

import { motion } from "framer-motion";
import { breathingMotion } from "../app/lib/motion";

interface ThinkingIndicatorProps {
  name: string;
  state?: "thinking" | "remembering" | "typing";
}

const stateLabels: Record<string, string> = {
  thinking: "TA正在思考...",
  remembering: "TA正在回忆...",
  typing: "TA正在输入...",
};

export default function ThinkingIndicator({ name, state = "thinking" }: ThinkingIndicatorProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="flex justify-start"
    >
      <motion.div
        animate={breathingMotion.animate}
        transition={breathingMotion.transition}
        className="rounded-2xl bg-[#16161A] px-4 py-3"
      >
        <p className="mb-2 text-[11px] font-light text-[#D6BFA3]">{name}</p>
        <div className="flex items-center gap-3">
          <div className="flex gap-1.5">
            {[0, 200, 400].map((delay, i) => (
              <motion.span
                key={i}
                className="h-1.5 w-1.5 rounded-full bg-[#D6BFA3]"
                animate={{ opacity: [0.3, 1, 0.3], y: [0, -2, 0] }}
                transition={{ duration: 1.4, repeat: Infinity, delay: delay / 1000, ease: "easeInOut" }}
              />
            ))}
          </div>
          <span className="text-[13px] font-light text-[#B0B0B0]">
            {stateLabels[state]}
          </span>
        </div>
      </motion.div>
    </motion.div>
  );
}