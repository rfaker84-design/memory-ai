"use client";

import { useEffect, useState, useMemo, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";

/* =========================================================================
   忆见 MemoryAI — Cinematic Emotional Intro v2
   电影级情绪叙事开场 · 记忆之门 · 星空 · 光尘
   ========================================================================= */

/* ── Config ───────────────────────────────────────────── */
const STAR_COUNT = 80;
const DUST_COUNT = 30;
const TOTAL_DURATION = 5000; // ms

/* ── Star Field ───────────────────────────────────────── */
function StarField() {
  const stars = useMemo(() =>
    Array.from({ length: STAR_COUNT }, () => ({
      x: Math.random() * 100,
      y: Math.random() * 85,
      size: 0.8 + Math.random() * 2.8,
      delay: Math.random() * 3,
      duration: 2.5 + Math.random() * 4,
      driftX: (Math.random() - 0.5) * 0.6,
      driftY: (Math.random() - 0.5) * 0.6,
      color: Math.random() > 0.7 ? "rgba(255,210,166," : "rgba(255,245,235,",
    })), []);

  return (
    <div style={{ position: "absolute", inset: 0, overflow: "hidden" }}>
      {stars.map((s, i) => (
        <motion.div
          key={i}
          style={{
            position: "absolute", left: s.x + "%", top: s.y + "%",
            width: s.size, height: s.size, borderRadius: "50%",
            background: s.color + "0.7)",
            boxShadow: s.size > 2 ? "0 0 " + (s.size * 2) + "px " + s.color + "0.3)" : "none",
          }}
          animate={{
            opacity: [0.1, 0.9, 0.1],
            scale: [0.7, 1.3, 0.7],
            x: [0, s.driftX * 3, 0],
            y: [0, s.driftY * 3, 0],
          }}
          transition={{
            duration: s.duration, delay: s.delay,
            repeat: Infinity, ease: "easeInOut",
          }}
        />
      ))}
    </div>
  );
}

/* ── Floating Light Dust ──────────────────────────────── */
function LightDust({ active }: { active: boolean }) {
  const particles = useMemo(() =>
    Array.from({ length: DUST_COUNT }, () => ({
      x: 40 + Math.random() * 20,
      y: 30 + Math.random() * 40,
      size: 1 + Math.random() * 2,
      delay: Math.random() * 2,
      duration: 3 + Math.random() * 4,
      driftX: (Math.random() - 0.5) * 15,
      driftY: -(5 + Math.random() * 25),
    })), []);

  return (
    <div style={{ position: "absolute", inset: 0, overflow: "hidden", pointerEvents: "none" }}>
      {particles.map((p, i) => (
        <motion.div
          key={i}
          initial={{ opacity: 0, x: 0, y: 0 }}
          animate={active ? {
            opacity: [0, 0.8, 0],
            x: p.driftX,
            y: p.driftY,
          } : { opacity: 0 }}
          transition={{
            duration: p.duration, delay: p.delay,
            repeat: active ? Infinity : 0, ease: "easeOut",
          }}
          style={{
            position: "absolute", left: p.x + "%", top: p.y + "%",
            width: p.size, height: p.size, borderRadius: "50%",
            background: "rgba(255,210,166,0.7)",
            boxShadow: "0 0 " + (p.size * 4) + "px rgba(255,179,124,0.4)",
            filter: "blur(" + (p.size * 0.5) + "px)",
          }}
        />
      ))}
    </div>
  );
}

/* ── Fog Layers (multiple depths) ─────────────────────── */
function FogLayers({ phase }: { phase: number }) {
  return (
    <>
      {/* Deep fog */}
      <motion.div
        style={{
          position: "absolute", inset: 0,
          background: "radial-gradient(ellipse at 50% 70%, rgba(11,10,8,0.7) 0%, transparent 55%)",
        }}
        animate={{ opacity: phase >= 2 ? [0.6, 0.85, 0.6] : 1 }}
        transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }}
      />
      {/* Warm fog */}
      <motion.div
        style={{
          position: "absolute", inset: 0,
          background: "radial-gradient(ellipse at 50% 55%, rgba(255,179,124,0.05) 0%, transparent 50%)",
        }}
        animate={{ opacity: phase >= 3 ? [0.5, 0.85, 0.5] : 0 }}
        transition={{ duration: 5, repeat: Infinity, ease: "easeInOut" }}
      />
      {/* Upper atmosphere */}
      <motion.div
        style={{
          position: "absolute", top: 0, left: 0, right: 0, height: "40%",
          background: "linear-gradient(to bottom, rgba(5,7,10,0.5) 0%, transparent 100%)",
        }}
      />
    </>
  );
}

/* ── Memory Gate ──────────────────────────────────────── */
function MemoryGate({ phase }: { phase: number }) {
  return (
    <div style={{ position: "relative", zIndex: 10 }}>
      {/* Outer glow ring */}
      <motion.div
        style={{
          position: "absolute", left: "50%", top: "50%",
          transform: "translate(-50%,-50%)",
          width: 240, height: 340, borderRadius: "50%",
          background: "radial-gradient(ellipse, rgba(255,179,124,0.06) 0%, transparent 65%)",
          filter: "blur(40px)",
        }}
        initial={{ opacity: 0, scale: 0.6 }}
        animate={{
          opacity: phase >= 1 ? 1 : 0,
          scale: phase >= 1 ? 1 : 0.6,
        }}
        transition={{ duration: 1.5, ease: "easeOut" }}
      />

      {/* Middle glow */}
      <motion.div
        style={{
          position: "absolute", left: "50%", top: "50%",
          transform: "translate(-50%,-50%)",
          width: 140, height: 240, borderRadius: "50%",
          background: "radial-gradient(ellipse, rgba(255,210,166,0.12) 0%, transparent 60%)",
          filter: "blur(25px)",
        }}
        initial={{ opacity: 0 }}
        animate={{ opacity: phase >= 2 ? 1 : 0 }}
        transition={{ duration: 1, delay: 0.2 }}
      />

      {/* Inner core glow */}
      <motion.div
        style={{
          position: "absolute", left: "50%", top: "50%",
          transform: "translate(-50%,-50%)",
          width: 60, height: 120, borderRadius: "50%",
          background: "radial-gradient(ellipse, rgba(255,245,235,0.25) 0%, rgba(255,210,166,0.1) 40%, transparent 70%)",
          filter: "blur(12px)",
        }}
        initial={{ opacity: 0 }}
        animate={{ opacity: phase >= 3 ? [0.6, 1, 0.6] : 0 }}
        transition={{ duration: 2, delay: 0.3, repeat: Infinity, ease: "easeInOut" }}
      />

      {/* Door — left pillar */}
      <motion.div
        style={{
          position: "absolute", left: "50%", top: "50%",
          transform: "translate(-50%,-50%)",
          width: 3, height: 200, borderRadius: 2,
          background: "linear-gradient(to bottom, transparent 5%, #FFD2A6 20%, #FFF3E8 50%, #FFD2A6 80%, transparent 95%)",
          boxShadow: "0 0 40px rgba(255,179,124,0.5), 0 0 80px rgba(255,179,124,0.2)",
        }}
        initial={{ opacity: 0, scaleX: 0.3, x: -20 }}
        animate={{
          opacity: phase >= 2 ? 1 : 0,
          scaleX: phase >= 3 ? 1 : 0.3,
          x: phase >= 3 ? -28 : -20,
        }}
        transition={{ duration: 1.2, ease: [0.16, 1, 0.3, 1] }}
      />

      {/* Door — right pillar */}
      <motion.div
        style={{
          position: "absolute", left: "50%", top: "50%",
          transform: "translate(-50%,-50%)",
          width: 3, height: 200, borderRadius: 2,
          background: "linear-gradient(to bottom, transparent 5%, #FFD2A6 20%, #FFF3E8 50%, #FFD2A6 80%, transparent 95%)",
          boxShadow: "0 0 40px rgba(255,179,124,0.5), 0 0 80px rgba(255,179,124,0.2)",
        }}
        initial={{ opacity: 0, scaleX: 0.3, x: 20 }}
        animate={{
          opacity: phase >= 2 ? 1 : 0,
          scaleX: phase >= 3 ? 1 : 0.3,
          x: phase >= 3 ? 28 : 20,
        }}
        transition={{ duration: 1.2, ease: [0.16, 1, 0.3, 1], delay: 0.05 }}
      />

      {/* Cross beam — top */}
      <motion.div
        style={{
          position: "absolute", left: "50%", top: "50%",
          transform: "translate(-50%,-50%)",
          width: 60, height: 2, borderRadius: 1,
          background: "#FFD2A6",
          boxShadow: "0 0 20px rgba(255,179,124,0.4)",
          marginTop: -98,
        }}
        initial={{ opacity: 0, scaleX: 0 }}
        animate={{ opacity: phase >= 3 ? 0.7 : 0, scaleX: phase >= 3 ? 1 : 0 }}
        transition={{ duration: 0.9, ease: "easeOut", delay: 0.4 }}
      />

      {/* Cross beam — bottom */}
      <motion.div
        style={{
          position: "absolute", left: "50%", top: "50%",
          transform: "translate(-50%,-50%)",
          width: 60, height: 2, borderRadius: 1,
          background: "#FFD2A6",
          boxShadow: "0 0 20px rgba(255,179,124,0.4)",
          marginTop: 98,
        }}
        initial={{ opacity: 0, scaleX: 0 }}
        animate={{ opacity: phase >= 3 ? 0.7 : 0, scaleX: phase >= 3 ? 1 : 0 }}
        transition={{ duration: 0.9, ease: "easeOut", delay: 0.4 }}
      />
    </div>
  );
}

/* ── Light Bloom ──────────────────────────────────────── */
function LightBloom({ phase }: { phase: number }) {
  return (
    <>
      {/* Central burst */}
      <motion.div
        style={{
          position: "absolute", left: "50%", top: "50%",
          transform: "translate(-50%,-50%)",
          width: 4, height: 4, borderRadius: "50%",
          pointerEvents: "none",
        }}
        initial={{ opacity: 0, width: 0, height: 0 }}
        animate={{
          opacity: phase >= 4 ? [0, 1, 0.5] : 0,
          width: phase >= 4 ? 350 : 0,
          height: phase >= 4 ? 350 : 0,
        }}
        transition={{ duration: 1.8, ease: [0.16, 1, 0.3, 1] }}
      >
        <div style={{
          width: "100%", height: "100%", borderRadius: "50%",
          background: "radial-gradient(circle, rgba(255,245,235,0.6) 0%, rgba(255,210,166,0.3) 15%, rgba(255,179,124,0.08) 40%, transparent 65%)",
        }} />
      </motion.div>

      {/* Screen-filling bloom for exit */}
      <motion.div
        style={{
          position: "fixed", inset: 0, zIndex: 9998, pointerEvents: "none",
          background: "radial-gradient(circle at 50% 50%, rgba(255,210,166,1) 0%, rgba(255,179,124,0.8) 25%, rgba(11,10,8,0.9) 70%)",
        }}
        initial={{ opacity: 0 }}
        animate={{ opacity: phase >= 5 ? [0, 1] : 0 }}
        transition={{ duration: 0.8, ease: "easeInOut" }}
      />
    </>
  );
}

/* ── Silhouettes ──────────────────────────────────────── */
function Silhouettes({ phase }: { phase: number }) {
  return (
    <motion.div
      style={{
        position: "absolute", left: "50%", bottom: "22%",
        transform: "translateX(-50%)",
        display: "flex", alignItems: "flex-end", gap: 10,
        zIndex: 11,
      }}
      initial={{ opacity: 0, y: 16 }}
      animate={{
        opacity: phase >= 4 ? 1 : 0,
        y: phase >= 4 ? 0 : 16,
      }}
      transition={{ duration: 1, delay: 0.3, ease: "easeOut" }}
    >
      {/* Father */}
      <motion.svg
        width="44" height="80" viewBox="0 0 40 80"
        animate={{ y: phase >= 5 ? [0, -4, 0] : 0 }}
        transition={{ duration: 5, repeat: Infinity, ease: "easeInOut" }}
      >
        <circle cx="20" cy="10" r="7.5" fill="#0B0A08" />
        <rect x="12" y="19" width="16" height="30" rx="7" fill="#0B0A08" />
        <rect x="14" y="49" width="5" height="25" rx="2.5" fill="#0B0A08" />
        <rect x="21" y="49" width="5" height="25" rx="2.5" fill="#0B0A08" />
      </motion.svg>

      {/* Child */}
      <motion.svg
        width="28" height="56" viewBox="0 0 30 60"
        animate={{ y: phase >= 5 ? [0, -3, 0] : 0 }}
        transition={{ duration: 5, repeat: Infinity, ease: "easeInOut", delay: 0.4 }}
      >
        <circle cx="15" cy="9" r="6" fill="#0B0A08" />
        <rect x="8" y="16" width="14" height="22" rx="6" fill="#0B0A08" />
        <rect x="10" y="38" width="4.5" height="18" rx="2" fill="#0B0A08" />
        <rect x="16" y="38" width="4.5" height="18" rx="2" fill="#0B0A08" />
      </motion.svg>
    </motion.div>
  );
}

/* ── Ground Reflection ────────────────────────────────── */
function GroundReflection({ phase }: { phase: number }) {
  return (
    <motion.div
      style={{
        position: "absolute", bottom: "12%", left: "50%",
        transform: "translateX(-50%)",
        width: 200, height: 50, borderRadius: "50%",
        background: "radial-gradient(ellipse, rgba(255,179,124,0.08) 0%, transparent 70%)",
        filter: "blur(8px)",
      }}
      initial={{ opacity: 0, scale: 0.5 }}
      animate={{
        opacity: phase >= 3 ? [0.3, 0.7, 0.3] : 0,
        scale: phase >= 3 ? 1 : 0.5,
      }}
      transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
    />
  );
}

/* ── Title ────────────────────────────────────────────── */
function CinematicTitle({ phase }: { phase: number }) {
  return (
    <motion.div
      style={{ position: "absolute", top: "10%", textAlign: "center", zIndex: 20, width: "100%" }}
      initial={{ opacity: 0, y: -16 }}
      animate={{ opacity: phase >= 1 ? 1 : 0, y: phase >= 1 ? 0 : -16 }}
      transition={{ duration: 1, ease: [0.16, 1, 0.3, 1] }}
    >
      <h1 style={{
        fontSize: "clamp(38px,11vw,56px)", fontWeight: 100,
        color: "#FFD2A6", letterSpacing: "0.18em", margin: 0,
        textShadow: "0 0 80px rgba(255,179,124,0.4), 0 0 160px rgba(255,179,124,0.15)",
      }}>
        忆见
      </h1>
    </motion.div>
  );
}

/* ── Tagline ──────────────────────────────────────────── */
function Tagline({ phase }: { phase: number }) {
  return (
    <motion.div
      style={{ position: "absolute", bottom: "7%", textAlign: "center", zIndex: 20, width: "100%" }}
      initial={{ opacity: 0 }}
      animate={{ opacity: phase >= 5 ? 1 : 0 }}
      transition={{ duration: 1.2, delay: 0.4, ease: "easeOut" }}
    >
      <p style={{
        fontSize: "clamp(12px,3vw,14px)", color: "rgba(255,210,166,0.45)",
        letterSpacing: "0.14em", margin: 0,
      }}>
        忆一人，见一生。
      </p>
    </motion.div>
  );
}

/* ══════════════════════════════════════════════════════════
   Cinematic Splash Container
   ══════════════════════════════════════════════════════════ */
export default function CinematicSplash({ onDone }: { onDone: () => void }) {
  const [phase, setPhase] = useState(0);
  const [exiting, setExiting] = useState(false);

  useEffect(() => {
    const t1 = setTimeout(() => setPhase(1), 600);   // Title + outer glow
    const t2 = setTimeout(() => setPhase(2), 1300);  // Door pillars + middle glow
    const t3 = setTimeout(() => setPhase(3), 2000);  // Door open + dust
    const t4 = setTimeout(() => setPhase(4), 2700);  // Light burst + silhouettes
    const t5 = setTimeout(() => setPhase(5), 3600);  // Bloom exit
    const t6 = setTimeout(() => setExiting(true), 4400);
    const t7 = setTimeout(onDone, 5000);
    return () => {
      [t1, t2, t3, t4, t5, t6, t7].forEach(clearTimeout);
    };
  }, [onDone]);

  return (
    <AnimatePresence>
      {!exiting && (
        <motion.div
          exit={{ opacity: 0 }}
          transition={{ duration: 0.8, ease: "easeInOut" }}
          style={{
            position: "fixed", inset: 0, zIndex: 9999,
            background: "linear-gradient(180deg, #030508 0%, #070A10 25%, #0B0A08 55%, #0B0A08 100%)",
            overflow: "hidden",
          }}
        >
          {/* Camera zoom — subtle scale animation on entire scene */}
          <motion.div
            style={{ position: "absolute", inset: 0 }}
            initial={{ scale: 1.08 }}
            animate={{ scale: phase >= 4 ? 1 : 1.08 }}
            transition={{ duration: 2.5, ease: [0.16, 1, 0.3, 1] }}
          >
            <StarField />
            <FogLayers phase={phase} />
            <LightDust active={phase >= 3} />
          </motion.div>

          <CinematicTitle phase={phase} />
          <MemoryGate phase={phase} />
          <GroundReflection phase={phase} />
          <Silhouettes phase={phase} />
          <LightBloom phase={phase} />
          <Tagline phase={phase} />
        </motion.div>
      )}
    </AnimatePresence>
  );
}
