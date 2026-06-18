"use client";
import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";

const QUOTES = [
  "有些人虽然离开了，但记忆依然在这里存在。",
  "有些记忆不会消失，只是换了一种存在方式。",
  "如果你愿意，他还在这里。",
  "欢迎回来。",
  "每一段记忆，都是永恒的一束光。",
  "思念是一扇门，推开它，就能重逢。",
  "时间带走了声音，却带不走你。",
  "这里的每句话，都是他曾说过的话。",
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
