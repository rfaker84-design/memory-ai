"use client";
import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import type { GravityNodeV4 } from "../hooks/useUniverseGravity";

interface MemoryData {
  id: string; name: string; relationship: string; life_story: string | null;
}

interface Props {
  memory: MemoryData;
  gravity: GravityNodeV4 | undefined;
  isFocused: boolean;
  isDimmed: boolean;
  isClicked: boolean;
  colorShift: { hue: number; sat: number; bri: number };
  onHover: (id: string | null) => void;
  onClick: (id: string) => void;
  onBoost: (id: string) => void;
}

export default function MemoryNodeV4({
  memory, gravity, isFocused, isDimmed, isClicked, colorShift, onHover, onClick, onBoost,
}: Props) {
  const [typedText, setTypedText] = useState("");
  const [typing, setTyping] = useState(false);
  const typeTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const narrationFetched = useRef(false);
  const dwellStart = useRef(0);

  const x = gravity?.x ?? 50;
  const y = gravity?.y ?? 35;
  const mass = gravity?.mass ?? 0.5;
  const z = gravity?.z ?? 1;
  const interactionBoost = gravity?.interactionBoost ?? 0;
  const layerOpacity = gravity?.layerOpacity ?? 1;
  const layerScale = gravity?.layerScale ?? 1;
  const layerBlur = gravity?.layerBlur ?? 0;

  // 基于 z 层 + mass + interaction 计算视觉参数
  const scale = (0.6 + mass * 0.7) * layerScale * (isFocused ? 1.55 : 1) * (isClicked ? 3 : 1) * (1 + interactionBoost * 0.4);
  const opacity = (isDimmed && !isFocused ? 0.12 : 0.9) * layerOpacity;
  const coreSize = 5 + mass * 6 + interactionBoost * 3;
  const glowIntensity = 0.25 + mass * 0.45 + interactionBoost * 0.3;

  // 颜色基于 emotion weight
  const hue = colorShift.hue + (mass - 0.5) * 30;
  const sat = colorShift.sat;
  const bri = colorShift.bri + mass * 20;

  // Hover → dwell tracking
  useEffect(() => {
    if (isFocused) {
      dwellStart.current = Date.now();
      onBoost(memory.id);
    }
  }, [isFocused, memory.id, onBoost]);

  // Typewriter on hover
  useEffect(() => {
    if (isFocused && !narrationFetched.current && memory.life_story) {
      narrationFetched.current = true;
      const text = memory.life_story.slice(0, 50);
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
      }, 50);
    } else if (!isFocused) {
      narrationFetched.current = false;
      setTypedText("");
      setTyping(false);
      if (typeTimer.current) clearInterval(typeTimer.current);
    }
    return () => { if (typeTimer.current) clearInterval(typeTimer.current); };
  }, [isFocused, memory.life_story]);

  const glowSize = 50 + mass * 55 + interactionBoost * 25;
  const glowColor = isClicked
    ? `0 0 60px hsla(${hue},${sat}%,${bri+30}%,0.9), 0 0 120px hsla(${hue},${sat}%,${bri+15}%,0.5), 0 0 200px hsla(${hue-10},${sat}%,${bri}%,0.3)`
    : isFocused
    ? `0 0 40px hsla(${hue},${sat}%,${bri+20}%,0.7), 0 0 80px hsla(${hue},${sat}%,${bri+10}%,0.35)`
    : `0 0 12px hsla(${hue},${sat}%,${bri}%,0.3), 0 0 24px hsla(${hue-5},${sat-10}%,${bri-5}%,0.12)`;

  return (
    <motion.div
      animate={{
        x: `${x}%`, y: `${y}%`, scale, opacity,
        filter: `blur(${isClicked ? 0 : isFocused ? 0 : layerBlur}px)`,
      }}
      transition={{ duration: 0.35, ease: "easeOut" }}
      style={{
        position: "absolute", transform: "translate(-50%, -50%)",
        zIndex: isClicked ? 80 : isFocused ? 50 : 10 + (2 - z) * 15,
      }}
      onMouseEnter={() => onHover(memory.id)}
      onMouseLeave={() => onHover(null)}
      onClick={() => onClick(memory.id)}
    >
      {/* ========== 外层光晕 ========== */}
      <motion.div
        animate={{
          scale: isClicked ? 3 : isFocused ? 1.6 : 1,
          opacity: isClicked ? 0.9 : isFocused ? 0.55 : 0.15 * layerOpacity,
        }}
        transition={{ duration: 0.45, ease: "easeOut" }}
        style={{
          position: "absolute", top: "50%", left: "50%",
          width: glowSize, height: glowSize,
          transform: "translate(-50%, -50%)",
          borderRadius: "50%",
          background: `radial-gradient(circle, hsla(${hue},${sat}%,${bri+20}%,${glowIntensity}) 0%, transparent 60%)`,
          filter: `blur(${8 + z * 3}px)`,
          pointerEvents: "none",
        }}
      />

      {/* ========== 呼吸环 ========== */}
      {(isFocused || isClicked) && (
        <motion.div
          animate={{
            scale: isClicked ? [1, 2.2, 1] : [1, 1.6, 1],
            opacity: isClicked ? [0.5, 0, 0.5] : [0.35, 0, 0.35],
          }}
          transition={{
            duration: isClicked ? 0.8 : 2.4,
            repeat: Infinity,
            ease: "easeInOut",
          }}
          style={{
            position: "absolute", top: "50%", left: "50%",
            width: glowSize, height: glowSize,
            transform: "translate(-50%, -50%)",
            borderRadius: "50%",
            border: `1.5px solid hsla(${hue},${sat}%,${bri+25}%,${isClicked ? 0.5 : 0.2})`,
            pointerEvents: "none",
          }}
        />
      )}

      {/* ========== 光核 ========== */}
      <motion.div
        animate={{ boxShadow: glowColor }}
        transition={{ duration: 0.3 }}
        style={{
          width: coreSize, height: coreSize,
          borderRadius: "50%",
          background: isClicked
            ? `hsla(${hue},30%,95%,1)`
            : `hsla(${hue},${sat-10}%,${bri+30}%,0.9)`,
          position: "relative",
          cursor: "pointer",
          boxShadow: `0 0 ${6 + mass * 8}px hsla(${hue},${sat}%,${bri}%,0.2)`,
        }}
      />

      {/* ========== Tooltip ========== */}
      <AnimatePresence>
        {isFocused && !isClicked && (
          <motion.div
            initial={{ opacity: 0, y: 8, filter: "blur(4px)" }}
            animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
            exit={{ opacity: 0, y: 4, filter: "blur(2px)" }}
            transition={{ duration: 0.3 }}
            style={{
              position: "absolute", top: coreSize + 14, left: "50%",
              transform: "translateX(-50%)", pointerEvents: "none",
            }}
          >
            <div style={{
              padding: "10px 18px", borderRadius: 14,
              background: "rgba(6,10,24,0.92)", backdropFilter: "blur(20px)",
              border: `1px solid hsla(${hue},${sat-20}%,${bri+10}%,0.15)`,
              textAlign: "center", minWidth: 120,
            }}>
              <p style={{ fontSize: 15, fontWeight: 400, color: "rgba(220,230,250,0.9)", letterSpacing: "0.06em", margin: 0 }}>
                {memory.name}
              </p>
              <p style={{ fontSize: 12, color: "rgba(160,180,210,0.5)", marginTop: 3, marginBottom: 0 }}>
                {memory.relationship}
              </p>
              {memory.life_story && (
                <p style={{
                  fontSize: 11, color: "rgba(140,160,200,0.4)", marginTop: 6, marginBottom: 0,
                  maxWidth: 180, whiteSpace: "normal", lineHeight: 1.6, minHeight: 16,
                }}>
                  {typedText}
                  {typing && (
                    <motion.span animate={{ opacity: [0, 1] }} transition={{ duration: 0.3, repeat: Infinity }}>
                      |
                    </motion.span>
                  )}
                </p>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}