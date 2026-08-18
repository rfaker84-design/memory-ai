"use client";
import { useEffect, useRef } from "react";
import { motion } from "framer-motion";
import type { FaceTransform } from "../lib/digital-human/ReactionEngine";
import type { PipelinePhase } from "../hooks/useRealtimeOrchestrator";

interface Props {
  avatarUrl: string | null;
  faceTransform: FaceTransform;
  phase: PipelinePhase;
  emotion: string;
  streamingText: string;
  latencyMs: number;
  name: string;
  size?: number;
  videoStream?: MediaStream | null;
}

const PHASE_GLOW: Record<string, string> = {
  idle: "rgba(140,160,200,0.1)",
  connecting: "rgba(160,180,220,0.2)",
  thinking: "rgba(160,140,200,0.28)",
  speaking: "rgba(200,160,120,0.38)",
  done: "rgba(140,180,200,0.15)",
};

const EMOTION_GLOW: Record<string, string> = {
  warm: "rgba(255,180,100,0.25)",
  calm: "rgba(140,180,220,0.18)",
  sad: "rgba(140,160,200,0.15)",
  nostalgic: "rgba(200,170,140,0.2)",
  thinking: "rgba(160,140,200,0.2)",
};

const PHASE_LABELS: Record<string, string> = {
  idle: "安静播放", connecting: "连接中…", thinking: "正在生成", speaking: "正在生成", done: "安静播放",
};

export default function RealtimeAvatar({
  avatarUrl, faceTransform, phase, emotion, streamingText, latencyMs, name, size = 200, videoStream,
}: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const { scale, rotateX, rotateY, translateX, translateY, filter } = faceTransform;
  const isActive = phase === "speaking" || phase === "thinking" || phase === "connecting";
  const glowColor = EMOTION_GLOW[emotion] || EMOTION_GLOW.calm;
  const phaseGlow = PHASE_GLOW[phase] || PHASE_GLOW.idle;

  // ─── Bind WebRTC video stream ─────────────────────────────
  useEffect(() => {
    if (videoRef.current && videoStream) {
      videoRef.current.srcObject = videoStream;
      videoRef.current.play().catch(() => {});
    }
  }, [videoStream]);

  return (
    <div className="relative flex flex-col items-center" style={{ width: size }}>
      {/* ── Phase glow ring ────────────────────────────────── */}
      <motion.div
        animate={{
          scale: isActive ? [1, 1.08, 1] : 1,
          opacity: isActive ? [0.4, 0.85, 0.4] : 0.35,
        }}
        transition={{
          duration: isActive ? 0.6 : 3, repeat: Infinity, ease: "easeInOut",
        }}
        className="absolute rounded-full pointer-events-none"
        style={{
          width: size + 50, height: size + 50, top: -25, left: -25,
          background: "radial-gradient(circle, " + phaseGlow + " 0%, transparent 65%)",
          filter: "blur(12px)",
        }}
      />

      {/* ── Emotion color ring ─────────────────────────────── */}
      <motion.div
        animate={{ opacity: isActive ? 0.5 : 0.2 }}
        transition={{ duration: 2 }}
        className="absolute rounded-full pointer-events-none"
        style={{
          width: size + 20, height: size + 20, top: -10, left: -10,
          background: "radial-gradient(circle, " + glowColor + " 0%, transparent 60%)",
          filter: "blur(8px)",
        }}
      />

      {/* ── Main avatar ─────────────────────────────────────── */}
      <motion.div
        animate={{ scale, rotateX, rotateY, x: translateX, y: translateY, filter }}
        transition={{ type: "tween", duration: 0.25, ease: "easeOut" }}
        className="relative rounded-full overflow-hidden"
        style={{
          width: size, height: size,
          boxShadow: "0 0 80px rgba(100,80,160,0.12), 0 0 0 1px rgba(255,255,255,0.06)",
        }}
      >
        {/* WebRTC video (Tencent Digital Human) */}
        <video
          ref={videoRef}
          autoPlay playsInline muted
          className="absolute inset-0 w-full h-full object-cover"
          style={{ display: videoStream ? "block" : "none" }}
        />

        {/* Image fallback */}
        {!videoStream && avatarUrl ? (
          <img src={avatarUrl} alt={name} className="w-full h-full object-cover" style={{ filter }} />
        ) : !videoStream ? (
          <div className="w-full h-full flex items-center justify-center" style={{
            background: "linear-gradient(135deg, rgba(40,35,55,0.95) 0%, rgba(25,22,38,0.95) 100%)",
          }}>
            <span className="text-[48px] font-light" style={{ color: "rgba(180,170,200,0.25)" }}>
              {name.charAt(0)}
            </span>
          </div>
        ) : null}

        {/* ── Phase overlays ────────────────────────────────── */}
        {phase === "speaking" && (
          <>
            <motion.div
              animate={{ opacity: [0.3, 0.7, 0.3], scale: [1, 1.03, 1] }}
              transition={{ duration: 0.7, repeat: Infinity }}
              className="absolute inset-0 rounded-full pointer-events-none"
              style={{ border: "2px solid rgba(200,170,140,0.4)", boxShadow: "inset 0 0 30px rgba(180,140,100,0.15)" }}
            />
            <motion.div
              animate={{ opacity: [0, 0.2, 0] }}
              transition={{ duration: 0.25, repeat: Infinity }}
              className="absolute bottom-0 left-[18%] right-[18%] h-[18%] rounded-b-full pointer-events-none"
              style={{ background: "linear-gradient(to top, rgba(220,200,180,0.3), transparent)" }}
            />
          </>
        )}

        {phase === "thinking" && (
          <motion.div
            animate={{ opacity: [0.15, 0.4, 0.15], rotate: [0, 360] }}
            transition={{ duration: 3, repeat: Infinity, ease: "linear" }}
            className="absolute inset-0 rounded-full pointer-events-none"
            style={{ border: "1.5px dashed rgba(160,140,200,0.3)" }}
          />
        )}

        {phase === "connecting" && (
          <motion.div
            animate={{ opacity: [0.2, 0.5, 0.2] }}
            transition={{ duration: 0.8, repeat: Infinity }}
            className="absolute inset-0 flex items-center justify-center pointer-events-none"
          >
            <div className="flex gap-1.5">
              {[0, 1, 2].map(i => (
                <motion.div key={i}
                  animate={{ y: [0, -6, 0] }}
                  transition={{ duration: 0.6, repeat: Infinity, delay: i * 0.15 }}
                  className="w-1.5 h-1.5 rounded-full" style={{ background: "rgba(180,160,220,0.6)" }}
                />
              ))}
            </div>
          </motion.div>
        )}

        {/* ── Streaming text overlay ────────────────────────── */}
        {streamingText && (phase === "thinking" || phase === "speaking") && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }}
            className="absolute bottom-0 left-0 right-0 px-3 py-2 pointer-events-none"
            style={{ background: "linear-gradient(to top, rgba(8,6,16,0.85) 0%, transparent 100%)" }}
          >
            <p className="text-[10px] leading-relaxed" style={{
              color: "rgba(200,190,170,0.5)", margin: 0, letterSpacing: "0.04em",
            }}>
              {streamingText.slice(-80)}
            </p>
          </motion.div>
        )}
      </motion.div>

      {/* ── Name + status ──────────────────────────────────── */}
      <div className="mt-3 text-center">
        <motion.p
          animate={{ opacity: isActive ? 0.7 : 0.4 }}
          className="text-[12px] tracking-[0.08em]"
          style={{ color: "rgba(200,190,170,0.6)", margin: 0 }}
        >
          {name}
        </motion.p>
        <motion.p
          animate={{ opacity: isActive ? 0.5 : 0.2 }}
          className="text-[9px] tracking-[0.1em] mt-0.5"
          style={{ color: "rgba(180,170,150,0.4)", margin: 0 }}
        >
          {PHASE_LABELS[phase] || phase}
        </motion.p>
        {latencyMs > 0 && (
          <p className="text-[8px] mt-0.5" style={{ color: "rgba(140,160,200,0.2)", margin: 0, fontFamily: "monospace" }}>
            {Math.round(latencyMs)}ms
          </p>
        )}
      </div>
    </div>
  );
}
