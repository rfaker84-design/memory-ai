"use client";
import { useMemo } from "react";
import { motion } from "framer-motion";
import type { Emotion } from "../lib/volc";

interface Props {
  avatarUrl: string | null;
  name: string;
  emotion: Emotion;
  speaking?: boolean;
  listening?: boolean;
  size?: number;
}

// ─── 情绪 → 视觉效果映射 ────────────────────────────────────
const EMOTION_VISUALS: Record<Emotion, {
  glowColor: string;
  glowSize: number;
  brightness: number;
  saturate: number;
  blur: number;
  breatheDuration: number;
}> = {
  warm: {
    glowColor: "rgba(255,170,80,",
    glowSize: 65,
    brightness: 1.08,
    saturate: 1.05,
    blur: 0,
    breatheDuration: 5,
  },
  calm: {
    glowColor: "rgba(130,180,230,",
    glowSize: 50,
    brightness: 1,
    saturate: 0.95,
    blur: 0,
    breatheDuration: 6,
  },
  sad: {
    glowColor: "rgba(140,150,170,",
    glowSize: 40,
    brightness: 0.9,
    saturate: 0.85,
    blur: 0,
    breatheDuration: 8,
  },
  nostalgic: {
    glowColor: "rgba(210,160,100,",
    glowSize: 70,
    brightness: 1.05,
    saturate: 0.9,
    blur: 1.5,
    breatheDuration: 5.5,
  },
};

export default function PresenceAvatar({
  avatarUrl, name, emotion, speaking = false, listening = false, size = 180,
}: Props) {
  const v = EMOTION_VISUALS[emotion] || EMOTION_VISUALS.calm;
  const glowAlpha = speaking ? 0.45 : listening ? 0.3 : 0.2;

  const filterStyle = [
    "brightness(" + v.brightness + ")",
    "saturate(" + v.saturate + ")",
    v.blur > 0 ? "blur(" + v.blur + "px)" : "",
  ].filter(Boolean).join(" ");

  const boxShadowStyle = [
    "0 0 " + v.glowSize + "px " + v.glowColor + glowAlpha + ")",
    "0 0 " + (v.glowSize * 1.5) + "px " + v.glowColor + (glowAlpha * 0.5) + ")",
    "0 0 0 1px rgba(255,255,255,0.04)",
  ].join(", ");

  const backgroundGlow =
    "radial-gradient(circle, " + v.glowColor + glowAlpha + ") 0%, transparent 65%)";

  return (
    <div className="relative flex flex-col items-center select-none" style={{ width: size }}>
      {/* ── 外层光晕 ──────────────────────────────────────── */}
      <motion.div
        animate={{
          scale: speaking ? [1, 1.07, 1] : [1, 1.03, 1],
          opacity: speaking
            ? [glowAlpha * 0.7, glowAlpha * 1.3, glowAlpha * 0.7]
            : [glowAlpha * 0.6, glowAlpha, glowAlpha * 0.6],
        }}
        transition={{
          duration: speaking ? 0.6 : v.breatheDuration,
          repeat: Infinity,
          ease: "easeInOut",
        }}
        className="absolute rounded-full pointer-events-none"
        style={{
          width: size + v.glowSize,
          height: size + v.glowSize,
          top: -(v.glowSize / 2),
          left: -(v.glowSize / 2),
          background: backgroundGlow,
          filter: "blur(" + (v.glowSize * 0.2) + "px)",
        }}
      />

      {/* ── 人脸容器 ──────────────────────────────────────── */}
      <motion.div
        animate={{
          scale: speaking ? [1, 1.02, 1] : [1, 1.03, 1],
          filter: filterStyle,
        }}
        transition={{
          scale: { duration: v.breatheDuration, repeat: Infinity, ease: "easeInOut" },
          filter: { duration: 0.7 },
        }}
        className="relative rounded-full overflow-hidden"
        style={{
          width: size, height: size,
          boxShadow: boxShadowStyle,
        }}
      >
        {avatarUrl ? (
          <img
            src={avatarUrl}
            alt={name}
            className="w-full h-full object-cover"
            style={{ filter: filterStyle }}
          />
        ) : (
          <div
            className="w-full h-full flex items-center justify-center"
            style={{
              background: "linear-gradient(135deg, rgba(35,30,50,0.95) 0%, rgba(20,18,32,0.95) 100%)",
            }}
          >
            <span
              className="text-[42px] font-light"
              style={{ color: "rgba(180,170,200,0.18)" }}
            >
              {name.charAt(0)}
            </span>
          </div>
        )}

        {/* ── 说话指示环 ──────────────────────────────────── */}
        {speaking && (
          <motion.div
            animate={{ opacity: [0.3, 0.65, 0.3], scale: [1, 1.04, 1] }}
            transition={{ duration: 0.7, repeat: Infinity }}
            className="absolute inset-0 rounded-full pointer-events-none"
            style={{
              border: "2px solid " + v.glowColor + "0.5)",
              boxShadow: "inset 0 0 25px " + v.glowColor + "0.12)",
            }}
          />
        )}

        {/* ── 倾听虚线环 ──────────────────────────────────── */}
        {listening && !speaking && (
          <motion.div
            animate={{ opacity: [0.15, 0.4, 0.15], rotate: [0, 360] }}
            transition={{ duration: 3, repeat: Infinity, ease: "linear" }}
            className="absolute inset-0 rounded-full pointer-events-none"
            style={{
              border: "1.5px dashed " + v.glowColor + "0.25)",
            }}
          />
        )}

        {/* ── 口型脉冲 ────────────────────────────────────── */}
        {speaking && (
          <motion.div
            animate={{ opacity: [0, 0.2, 0] }}
            transition={{ duration: 0.28, repeat: Infinity }}
            className="absolute bottom-0 left-[15%] right-[15%] h-[16%] rounded-b-full pointer-events-none"
            style={{
              background: "linear-gradient(to top, " + v.glowColor + "0.3), transparent)",
            }}
          />
        )}
      </motion.div>

      {/* ── 名字 ──────────────────────────────────────────── */}
      <motion.p
        animate={{ opacity: speaking ? 0.7 : 0.35 }}
        transition={{ duration: 0.7 }}
        className="mt-3 text-[12px] tracking-[0.08em] text-center"
        style={{ color: "rgba(200,190,170,0.6)", margin: 0 }}
      >
        {name}
      </motion.p>

      {/* ── 状态指示 ──────────────────────────────────────── */}
      <motion.p
        animate={{ opacity: speaking ? 0.35 : 0.15 }}
        transition={{ duration: 0.7 }}
        className="text-[9px] tracking-[0.12em] mt-0.5"
        style={{ color: v.glowColor + "0.8)", margin: 0 }}
      >
        {speaking ? "● 正在生成" : listening ? "○ 正在加载" : "安静播放"}
      </motion.p>
    </div>
  );
}
