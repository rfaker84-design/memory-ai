"use client";
import { motion } from "framer-motion";
import type { FaceTransform } from "../lib/digital-human/ReactionEngine";

interface Props {
  avatarUrl: string | null;       // AI-generated face image/video URL
  faceTransform: FaceTransform;
  isSpeaking: boolean;
  emotion: string;
  name: string;
  size?: number;                  // px, default 200
}

const EMOTION_GLOW: Record<string, string> = {
  warm: "rgba(255,180,100,0.2)",
  calm: "rgba(140,180,220,0.15)",
  sad: "rgba(140,160,200,0.12)",
  nostalgic: "rgba(200,170,140,0.18)",
  listening: "rgba(140,200,180,0.15)",
  thinking: "rgba(160,140,200,0.15)",
};

export default function RealAvatar({
  avatarUrl, faceTransform, isSpeaking, emotion, name, size = 200,
}: Props) {
  const { scale, rotateX, rotateY, translateX, translateY, filter } = faceTransform;
  const glowColor = EMOTION_GLOW[emotion] || EMOTION_GLOW.calm;

  return (
    <div className="relative flex flex-col items-center" style={{ width: size }}>
      {/* Outer emotion glow */}
      <motion.div
        animate={{
          scale: isSpeaking ? [1, 1.04, 1] : 1,
          opacity: isSpeaking ? [0.4, 0.7, 0.4] : 0.4,
        }}
        transition={{ duration: isSpeaking ? 0.6 : 3, repeat: Infinity }}
        className="absolute rounded-full pointer-events-none"
        style={{
          width: size + 40, height: size + 40,
          top: -20, left: -20,
          background: "radial-gradient(circle, " + glowColor + " 0%, transparent 65%)",
          filter: "blur(10px)",
        }}
      />

      {/* Main avatar container with face transforms */}
      <motion.div
        animate={{
          scale, rotateX, rotateY,
          x: translateX, y: translateY,
          filter,
        }}
        transition={{ type: "tween", duration: 0.3, ease: "easeOut" }}
        className="relative rounded-full overflow-hidden"
        style={{
          width: size, height: size,
          boxShadow: "0 0 60px rgba(100,80,160,0.1), 0 0 0 1px rgba(255,255,255,0.05)",
        }}
      >
        {avatarUrl ? (
          // Real AI-generated face
          <img
            src={avatarUrl}
            alt={name}
            className="w-full h-full object-cover"
            style={{ filter }}
            onError={(e) => {
              // Fallback to placeholder
              (e.target as HTMLImageElement).style.display = "none";
            }}
          />
        ) : null}

        {/* Placeholder when no avatar */}
        {!avatarUrl && (
          <div
            className="w-full h-full flex items-center justify-center"
            style={{
              background: "linear-gradient(135deg, rgba(40,35,55,0.9) 0%, rgba(25,22,38,0.9) 100%)",
            }}
          >
            <span
              className="text-[48px] font-light"
              style={{ color: "rgba(180,170,200,0.3)" }}
            >
              {name.charAt(0)}
            </span>
          </div>
        )}

        {/* Speaking indicator ring */}
        {isSpeaking && (
          <motion.div
            animate={{ opacity: [0.3, 0.7, 0.3], scale: [1, 1.02, 1] }}
            transition={{ duration: 0.8, repeat: Infinity }}
            className="absolute inset-0 rounded-full pointer-events-none"
            style={{
              border: "1.5px solid rgba(180,160,220,0.3)",
              boxShadow: "inset 0 0 20px rgba(140,120,200,0.1)",
            }}
          />
        )}

        {/* Micro lip-sync overlay (subtle lower-face pulse) */}
        {isSpeaking && (
          <motion.div
            animate={{ opacity: [0, 0.15, 0] }}
            transition={{ duration: 0.3, repeat: Infinity }}
            className="absolute bottom-0 left-[20%] right-[20%] h-[15%] rounded-b-full pointer-events-none"
            style={{
              background: "linear-gradient(to top, rgba(200,180,220,0.2), transparent)",
            }}
          />
        )}
      </motion.div>

      {/* Name below */}
      <motion.p
        animate={{ opacity: isSpeaking ? 0.6 : 0.35 }}
        className="mt-3 text-[12px] tracking-[0.08em] text-center"
        style={{ color: "rgba(200,190,170,0.6)", margin: 0 }}
      >
        {name}
      </motion.p>
    </div>
  );
}
