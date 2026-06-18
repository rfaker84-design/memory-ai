/* =========================================================================
   忆见 MemoryAI — V2 Emotion UI System
   Canonical theme · Glass · Warm · Apple-level
   ========================================================================= */

import type { TargetAndTransition } from "framer-motion";

/* ── Core Palette ─────────────────────────────────────── */
export const V2 = {
  background:   "#0B0A08",
  surface:      "#1A1410",
  surface2:     "#201A15",
  overlay:      "rgba(11,10,8,0.94)",

  primary:      "#FFB37C",
  primarySoft:  "rgba(255,179,124,0.12)",
  primaryGlow:  "rgba(255,179,124,0.10)",
  accent:       "#FFD2A6",
  accentSoft:   "rgba(255,210,166,0.08)",

  text:         "#FFF3E8",
  muted:        "#D6BBA6",
  faint:        "rgba(214,187,166,0.40)",

  border:       "rgba(255,255,255,0.06)",
  borderLight:  "rgba(255,255,255,0.10)",
  borderGlow:   "rgba(255,179,124,0.22)",

  success:      "#7BC67E",
  warning:      "#F0B864",
  error:        "#E0736A",
} as const;

/* ── Glass System ─────────────────────────────────────── */
export const glass = {
  card:  "backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px);border:0.5px solid rgba(255,255,255,0.06);background:rgba(26,20,16,0.85)",
  input: "backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px);border:0.5px solid rgba(255,255,255,0.08);background:rgba(26,20,16,0.70)",
};

/* ── Radius ───────────────────────────────────────────── */
export const r = { sm:10, md:14, lg:18, xl:22, full:9999 };

/* ── Shadow ───────────────────────────────────────────── */
export const shadow = {
  card:     "0 4px 16px rgba(0,0,0,0.30), 0 0 0 0.5px rgba(255,255,255,0.03)",
  elevated: "0 10px 30px rgba(0,0,0,0.30), 0 0 0 0.5px rgba(255,255,255,0.04)",
  glow:     "0 0 30px rgba(255,179,124,0.08), 0 0 60px rgba(255,179,124,0.03)",
};

/* ── Spacing ──────────────────────────────────────────── */
export const s = { xs:4, sm:8, md:12, lg:16, xl:20, "2xl":24, "3xl":32 };

/* ── Gradients ────────────────────────────────────────── */
export const gradient = {
  ambient: "radial-gradient(ellipse at 50% 35%, rgba(255,179,124,0.06) 0%, transparent 60%)",
  halo:    "radial-gradient(circle, rgba(255,179,124,0.10) 0%, transparent 70%)",
};

/* ── Motion Presets ───────────────────────────────────── */
export const motion = {
  enter:   { initial:{opacity:0,y:4} as TargetAndTransition, animate:{opacity:1,y:0} as TargetAndTransition, transition:{duration:0.3,ease:"easeOut" as const} },
  fadeIn:  { initial:{opacity:0} as TargetAndTransition, animate:{opacity:1} as TargetAndTransition, transition:{duration:0.4,ease:"easeOut" as const} },
  press:   { whileTap:{scale:0.98}, transition:{duration:0.1} },
};
