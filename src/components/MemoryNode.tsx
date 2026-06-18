"use client";
import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import type { NodeDrift } from "../hooks/useMemoryField";

interface MemoryData {
  id: string;
  name: string;
  relationship: string;
  life_story: string | null;
}

interface Props {
  memory: MemoryData;
  position: { x: number; y: number };
  drift: NodeDrift | undefined;
  depth: "front" | "mid" | "back";
  isFocused: boolean;
  isDimmed: boolean;
  parallax: { x: number; y: number };
  onHover: (id: string | null) => void;
  onClick: (id: string) => void;
}

export default function MemoryNode({
  memory, position, drift, depth, isFocused, isDimmed, parallax, onHover, onClick,
}: Props) {
  const [typedText, setTypedText] = useState("");
  const [typing, setTyping] = useState(false);
  const typeTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  const depthScale = depth === "front" ? 1.3 : depth === "mid" ? 1 : 0.7;
  const depthOpacity = depth === "front" ? 1 : depth === "mid" ? 0.7 : 0.35;
  const depthBlur = depth === "back" ? 2 : 0;

  // ����������RAF ������ sin wave��
  const breathe = drift?.opacity ?? 0.6;
  const driftX = drift?.x ?? 0;
  const driftY = drift?.y ?? 0;
  const driftScale = drift?.scale ?? 1;

  const coreSize = depth === "front" ? 12 : depth === "mid" ? 8 : 5;
  const glowSize = depth === "front" ? 100 : depth === "mid" ? 70 : 40;

  // Typewriter on focus
  useEffect(() => {
    if (isFocused && memory.life_story) {
      setTyping(true);
      setTypedText("");
      let i = 0;
      const text = memory.life_story.slice(0, 50);
      typeTimer.current = setInterval(() => {
        i++;
        setTypedText(text.slice(0, i));
        if (i >= text.length) {
          if (typeTimer.current) clearInterval(typeTimer.current);
          setTyping(false);
        }
      }, 60);
    } else {
      setTypedText("");
      setTyping(false);
      if (typeTimer.current) clearInterval(typeTimer.current);
    }
    return () => { if (typeTimer.current) clearInterval(typeTimer.current); };
  }, [isFocused, memory.life_story]);

  const nodeScale = depthScale * driftScale * (isFocused ? 1.5 : 1);
  const nodeOpacity = depthOpacity * (isDimmed && !isFocused ? 0.25 : 1);
  const glowOpacity = isFocused ? 0.6 : 0.15;
  const coreGlow = isFocused
    ? "0 0 40px rgba(180,210,255,0.7), 0 0 80px rgba(140,180,240,0.35)"
    : "0 0 12px rgba(140,180,220,0.4), 0 0 24px rgba(120,150,200,0.15)";

  return (
    <motion.div
      animate={{
        x: position.x + driftX + parallax.x * (depth === "front" ? 0.6 : depth === "mid" ? 0.35 : 0.15),
        y: position.y + driftY + parallax.y * (depth === "front" ? 0.5 : depth === "mid" ? 0.3 : 0.1),
        scale: nodeScale,
        opacity: nodeOpacity,
        filter: `blur(${depthBlur}px)`,
      }}
      transition={{ duration: 0.8, ease: "easeOut" }}
      style={{
        position: "absolute",
        transform: "translate(-50%, -50%)",
        zIndex: isFocused ? 40 : depth === "front" ? 20 : depth === "mid" ? 15 : 5,
        cursor: "pointer",
      }}
      onMouseEnter={() => onHover(memory.id)}
      onMouseLeave={() => onHover(null)}
      onClick={() => onClick(memory.id)}
    >
      {/* Glow ring */}
      <motion.div
        animate={{
          scale: isFocused ? 1.3 : 1,
          opacity: glowOpacity * breathe,
        }}
        transition={{ duration: 0.5, ease: "easeOut" }}
        style={{
          position: "absolute",
          top: "50%", left: "50%",
          width: glowSize, height: glowSize,
          transform: "translate(-50%, -50%)",
          borderRadius: "50%",
          background: "radial-gradient(circle, rgba(160,200,255,0.35) 0%, transparent 60%)",
          filter: "blur(8px)",
          pointerEvents: "none",
        }}
      />

      {/* Outer pulse ring */}
      {isFocused && (
        <motion.div
          animate={{ scale: [1, 1.6, 1], opacity: [0.3, 0, 0.3] }}
          transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
          style={{
            position: "absolute",
            top: "50%", left: "50%",
            width: glowSize, height: glowSize,
            transform: "translate(-50%, -50%)",
            borderRadius: "50%",
            border: "1px solid rgba(160,200,255,0.3)",
            pointerEvents: "none",
          }}
        />
      )}

      {/* Light core */}
      <motion.div
        animate={{
          boxShadow: coreGlow,
        }}
        transition={{ duration: 0.4, ease: "easeOut" }}
        style={{
          width: coreSize, height: coreSize,
          borderRadius: "50%",
          background: "rgba(210,225,255,0.9)",
          position: "relative",
        }}
      />

      {/* Hover tooltip */}
      <AnimatePresence>
        {isFocused && (
          <motion.div
            initial={{ opacity: 0, y: 8, filter: "blur(4px)" }}
            animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
            exit={{ opacity: 0, y: 4, filter: "blur(2px)" }}
            transition={{ duration: 0.35, ease: "easeOut" }}
            style={{
              position: "absolute",
              top: coreSize + 16, left: "50%",
              transform: "translateX(-50%)",
              pointerEvents: "none",
            }}
          >
            <div
              style={{
                padding: "10px 18px",
                borderRadius: 14,
                background: "rgba(8,12,28,0.88)",
                backdropFilter: "blur(16px)",
                border: "1px solid rgba(120,160,220,0.18)",
                textAlign: "center",
                minWidth: 120,
              }}
            >
              <p style={{
                fontSize: 15, fontWeight: 400,
                color: "rgba(220,230,250,0.88)",
                letterSpacing: "0.06em", margin: 0,
              }}>
                {memory.name}
              </p>
              <p style={{
                fontSize: 12, color: "rgba(160,180,210,0.5)",
                marginTop: 3, marginBottom: 0,
              }}>
                {memory.relationship}
              </p>
              {memory.life_story && (
                <p style={{
                  fontSize: 11, color: "rgba(140,160,200,0.4)",
                  marginTop: 6, marginBottom: 0,
                  maxWidth: 180, whiteSpace: "normal",
                  lineHeight: 1.6, minHeight: 16,
                }}>
                  {typedText}
                  {typing && <motion.span animate={{ opacity: [0, 1] }} transition={{ duration: 0.3, repeat: Infinity }}>|</motion.span>}
                </p>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}