"use client";
import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";

const QUOTES = [
  "AI生成 · 基于你确认的信息。",
  "每一段资料都由你确认后保存。",
  "从一张照片和一个称呼开始。",
  "忆一人，见一生。",
  "内容仅用于你选择的功能。",
  "可以从一件具体的事开始。",
  "你可以随时查看资料来源。",
  "AI 内容不代表真实人物表达。",
];

export default function MemoryText() {
  const [quote, setQuote] = useState("");
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const q = QUOTES[Math.floor(Math.random() * QUOTES.length)];
    setQuote(q);
    const t1 = setTimeout(() => setVisible(true), 800);
    const t2 = setTimeout(() => setVisible(false), 3800);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, []);

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ opacity: 0, filter: "blur(8px)", y: 8 }}
          animate={{ opacity: 0.7, filter: "blur(0px)", y: 0 }}
          exit={{ opacity: 0, filter: "blur(8px)", y: -4 }}
          transition={{ duration: 0.9, ease: "easeOut" }}
          className="absolute bottom-24 left-0 right-0 text-center pointer-events-none z-20"
        >
          <p style={{ fontSize: 15, fontWeight: 300, color: "rgba(255,235,200,0.7)", letterSpacing: "0.1em", textShadow: "0 0 20px rgba(255,180,100,0.3)", padding: "0 40px", lineHeight: 1.8 }}>
            {quote}
          </p>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
