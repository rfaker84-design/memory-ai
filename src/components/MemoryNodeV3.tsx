"use client";
import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import type { GravityNode } from "../hooks/useEmotionGravity";

interface MemoryData {
  id: string; name: string; relationship: string; life_story: string | null;
}

interface Props {
  memory: MemoryData;
  gravity: GravityNode | undefined;
  isFocused: boolean;
  isDimmed: boolean;
  isClicked: boolean;
  onHover: (id: string | null) => void;
  onClick: (id: string) => void;
}

export default function MemoryNodeV3({ memory, gravity, isFocused, isDimmed, isClicked, onHover, onClick }: Props) {
  const [narration, setNarration] = useState<string | null>(null);
  const [typedText, setTypedText] = useState("");
  const [typing, setTyping] = useState(false);
  const typeTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const narrationFetched = useRef(false);

  const x = gravity?.x ?? 50;
  const y = gravity?.y ?? 32;
  const mass = gravity?.mass ?? 0.6;
  const scale = 0.8 + mass * 0.6 * (isFocused ? 1.6 : 1) * (isClicked ? 2.5 : 1);
  const opacity = isDimmed && !isFocused ? 0.2 : 0.85;
  const coreSize = 6 + mass * 6;

  // AI narration on hover
  useEffect(() => {
    if (isFocused && !narrationFetched.current && memory.life_story) {
      narrationFetched.current = true;
      const text = memory.life_story.slice(0, 50);
      // ����Ч��
      setTyping(true);
      setTypedText("");
      let i = 0;
      typeTimer.current = setInterval(() => {
        i++;
        setTypedText(text.slice(0, i));
        if (i >= text.length) {
          if (typeTimer.current) clearInterval(typeTimer.current);
          setTyping(false);
        }
      }, 55);
    } else if (!isFocused) {
      narrationFetched.current = false;
      setTypedText("");
      setTyping(false);
      if (typeTimer.current) clearInterval(typeTimer.current);
    }
    return () => { if (typeTimer.current) clearInterval(typeTimer.current); };
  }, [isFocused, memory.life_story]);

  const glowSize = 60 + mass * 60;
  const glowColor = isClicked
    ? "0 0 50px rgba(200,225,255,0.9), 0 0 100px rgba(160,200,255,0.5), 0 0 160px rgba(120,170,240,0.3)"
    : isFocused
    ? "0 0 35px rgba(180,210,255,0.7), 0 0 70px rgba(140,180,240,0.35)"
    : "0 0 10px rgba(140,180,220,0.35), 0 0 20px rgba(120,150,200,0.12)";

  return (
    <motion.div
      animate={{ x: `${x}%`, y: `${y}%`, scale, opacity }}
      transition={{ duration: 0.3, ease: "easeOut" }}
      style={{ position: "absolute", transform: "translate(-50%, -50%)", zIndex: isClicked ? 60 : isFocused ? 40 : 10 }}
      onMouseEnter={() => onHover(memory.id)}
      onMouseLeave={() => onHover(null)}
      onClick={() => onClick(memory.id)}
    >
      {/* Glow halo */}
      <motion.div
        animate={{
          scale: isClicked ? 2.5 : isFocused ? 1.4 : 1,
          opacity: isClicked ? 0.8 : isFocused ? 0.5 : 0.15,
        }}
        transition={{ duration: 0.4, ease: "easeOut" }}
        style={{
          position: "absolute", top: "50%", left: "50%",
          width: glowSize, height: glowSize,
          transform: "translate(-50%, -50%)",
          borderRadius: "50%",
          background: "radial-gradient(circle, rgba(160,200,255,0.3) 0%, transparent 60%)",
          filter: "blur(8px)", pointerEvents: "none",
        }}
      />

      {/* Pulse ring */}
      {(isFocused || isClicked) && (
        <motion.div
          animate={{ scale: [1, 1.8, 1], opacity: [0.4, 0, 0.4] }}
          transition={{ duration: isClicked ? 1 : 2.2, repeat: Infinity, ease: "easeInOut" }}
          style={{
            position: "absolute", top: "50%", left: "50%",
            width: glowSize, height: glowSize,
            transform: "translate(-50%, -50%)",
            borderRadius: "50%",
            border: `1.5px solid rgba(160,200,255,${isClicked ? 0.5 : 0.25})`,
            pointerEvents: "none",
          }}
        />
      )}

      {/* Light core */}
      <motion.div
        animate={{ boxShadow: glowColor }}
        transition={{ duration: 0.3 }}
        style={{
          width: coreSize, height: coreSize,
          borderRadius: "50%",
          background: isClicked ? "rgba(240,245,255,1)" : "rgba(210,225,255,0.9)",
          position: "relative",
          cursor: "pointer",
        }}
      />

      {/* Tooltip */}
      <AnimatePresence>
        {isFocused && !isClicked && (
          <motion.div
            initial={{ opacity: 0, y: 8, filter: "blur(4px)" }}
            animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
            exit={{ opacity: 0, y: 4, filter: "blur(2px)" }}
            transition={{ duration: 0.3 }}
            style={{ position: "absolute", top: coreSize + 14, left: "50%", transform: "translateX(-50%)", pointerEvents: "none" }}
          >
            <div style={{
              padding: "10px 18px", borderRadius: 14,
              background: "rgba(6,10,24,0.9)", backdropFilter: "blur(16px)",
              border: "1px solid rgba(120,160,220,0.15)", textAlign: "center", minWidth: 120,
            }}>
              <p style={{ fontSize: 15, fontWeight: 400, color: "rgba(220,230,250,0.9)", letterSpacing: "0.06em", margin: 0 }}>{memory.name}</p>
              <p style={{ fontSize: 12, color: "rgba(160,180,210,0.5)", marginTop: 3, marginBottom: 0 }}>{memory.relationship}</p>
              {memory.life_story && (
                <p style={{ fontSize: 11, color: "rgba(140,160,200,0.4)", marginTop: 6, marginBottom: 0, maxWidth: 180, whiteSpace: "normal", lineHeight: 1.6, minHeight: 16 }}>
                  {typedText}{typing && <motion.span animate={{ opacity: [0, 1] }} transition={{ duration: 0.3, repeat: Infinity }}>|</motion.span>}
                </p>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}