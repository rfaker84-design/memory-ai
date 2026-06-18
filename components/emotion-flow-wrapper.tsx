"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { EmotionFlow, EmotionState } from "../app/lib/emotion-flow";

/* =========================================================================
   EmotionFlowWrapper — wraps content in emotional state transitions
   ========================================================================= */

export default function EmotionFlowWrapper({
  state,
  children,
  className = "",
}: {
  state: EmotionState;
  children: React.ReactNode;
  className?: string;
}) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    EmotionFlow.transition(state);
    const t = setTimeout(() => setMounted(true), 50);
    return () => clearTimeout(t);
  }, [state]);

  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={state}
        custom={state}
        variants={EmotionFlow.variants}
        initial="enter"
        animate={mounted ? "center" : "enter"}
        exit="exit"
        transition={{ duration: EmotionFlow.timing.enter, ease: "easeOut" }}
        className={className}
      >
        {children}
      </motion.div>
    </AnimatePresence>
  );
}