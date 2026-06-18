/* =========================================================================
   忆见 MemoryAI — App Store Warm Theme
   Warm Emotional Tech · Golden Glow · Amber Soft
   ========================================================================= */

import type { TargetAndTransition } from "framer-motion";

/* ── Warm Color Palette ────────────────────────────────── */
export const palette = {
  background:   "#0B0A08",
  surface:      "#1A1410",
  surface2:     "#201A15",
  overlay:      "rgba(11,10,8,0.94)",

  primary:      "#FFB37C",
  primarySoft:  "rgba(255,179,124,0.12)",
  primaryGlow:  "rgba(255,179,124,0.10)",
  accent:       "#FFD2A6",
  accentSoft:   "rgba(255,210,166,0.10)",
  accentGlow:   "rgba(255,210,166,0.08)",

  textPrimary:  "#EDE8E2",
  textSecondary:"#A89E90",
  textMuted:    "rgba(168,158,144,0.42)",

  border:       "rgba(255,255,255,0.06)",
  borderLight:  "rgba(255,255,255,0.10)",
  borderPrimary:"rgba(255,179,124,0.22)",

  success:      "#7BC67E",
  warning:      "#F0B864",
  error:        "#E0736A",
};

/* ── Warm Gradients ────────────────────────────────────── */
export const gradient = {
  ambient: "radial-gradient(ellipse at 50% 35%, rgba(255,179,124,0.06) 0%, transparent 60%)",
  halo:    "radial-gradient(circle, rgba(255,179,124,0.10) 0%, transparent 70%)",
  deep:    "linear-gradient(180deg, #0B0A08 0%, #1A1410 50%, #201A15 100%)",
};

/* ── Typography ────────────────────────────────────────── */
export const typography = {
  fontFamily: '"SF Pro Display", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", ui-sans-serif, system-ui, sans-serif',
  hero:       { fontSize:"clamp(38px,11vw,54px)", fontWeight:800, letterSpacing:"0.06em", lineHeight:1.15 },
  title:      { fontSize:"clamp(20px,5vw,26px)",   fontWeight:700, letterSpacing:"-0.01em", lineHeight:1.3 },
  emotion:    { fontSize:"26px", fontWeight:600, letterSpacing:"0.03em", lineHeight:1.4 },
  body:       { fontSize:"15px", fontWeight:400, lineHeight:1.75 },
  caption:    { fontSize:"12px", fontWeight:400, lineHeight:1.5 },
};

/* ── Radius ────────────────────────────────────────────── */
export const radius = { button:14, card:18, modal:22, input:14, sm:10, md:14, lg:18, xl:24, full:9999 };

/* ── Soft Warm Shadows ─────────────────────────────────── */
export const shadow = {
  card:     "0 4px 16px rgba(0,0,0,0.30), 0 0 0 0.5px rgba(255,255,255,0.03)",
  elevated: "0 10px 30px rgba(0,0,0,0.30), 0 0 0 0.5px rgba(255,255,255,0.04)",
  glow:     "0 0 30px rgba(255,179,124,0.08), 0 0 60px rgba(255,179,124,0.03)",
  icon:     "0 10px 30px rgba(0,0,0,0.35), 0 0 50px rgba(255,179,124,0.10)",
};

/* ── Motion Presets ────────────────────────────────────── */
export const motion = {
  pageEnter: { initial:{opacity:0,y:4} as TargetAndTransition, animate:{opacity:1,y:0} as TargetAndTransition, transition:{duration:0.25,ease:"easeOut" as const} },
  fadeIn:    { initial:{opacity:0} as TargetAndTransition, animate:{opacity:1} as TargetAndTransition, transition:{duration:0.35,ease:"easeOut" as const} },
  press:     { whileTap:{scale:0.97}, transition:{duration:0.1} },
};

/* ── App Store Screenshot Dimensions ───────────────────── */
export const screenshot = {
  iphonePro: { width:390, height:844 },
  iphoneProMax: { width:430, height:932 },
  export: { width:1290, height:2796 },
};
