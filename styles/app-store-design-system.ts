/* =========================================================================
   忆见 MemoryAI — App Store Design System
   Production-grade · Apple HIG compliant · Dark Luxury
   ========================================================================= */

import type { TargetAndTransition } from "framer-motion";

/* ── Color System ─────────────────────────────────────── */
export const palette = {
  background:   "#0A0C10",
  surface:      "#121621",
  surface2:     "#161B26",
  overlay:      "rgba(10,12,16,0.94)",

  primary:      "#6D7CFF",
  primarySoft:  "rgba(109,124,255,0.12)",
  primaryGlow:  "rgba(109,124,255,0.08)",
  accent:       "#8B7CFF",
  accentSoft:   "rgba(139,124,255,0.10)",

  textPrimary:  "#E8ECF3",
  textSecondary:"#9AA3B2",
  textMuted:    "rgba(154,163,178,0.42)",

  border:       "rgba(255,255,255,0.06)",
  borderLight:  "rgba(255,255,255,0.10)",
  borderPrimary:"rgba(109,124,255,0.20)",

  success:      "#4ADE80",
  warning:      "#FBBF24",
  error:        "#F87171",
};

/* ── Typography ────────────────────────────────────────── */
export const typography = {
  fontFamily: '"SF Pro Display", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", ui-sans-serif, system-ui, sans-serif',

  hero:       { fontSize: "clamp(38px,11vw,54px)", fontWeight: 800, letterSpacing: "0.06em", lineHeight: 1.15 },
  title:      { fontSize: "clamp(20px,5vw,26px)",   fontWeight: 700, letterSpacing: "-0.01em", lineHeight: 1.3 },
  subtitle:   { fontSize: "18px", fontWeight: 400, letterSpacing: "0.02em", lineHeight: 1.5 },
  body:       { fontSize: "15px", fontWeight: 400, lineHeight: 1.7 },
  caption:    { fontSize: "12px", fontWeight: 400, lineHeight: 1.5 },
  label:      { fontSize: "11px", fontWeight: 600, letterSpacing: "0.08em", lineHeight: 1.4 },

  /* App Store screenshot sizes */
  screenshotEmotion: { fontSize: "28px", fontWeight: 600, letterSpacing: "0.03em", lineHeight: 1.35 },
  screenshotFeature: { fontSize: "20px", fontWeight: 600, letterSpacing: "0.02em", lineHeight: 1.4 },
};

/* ── Radius ────────────────────────────────────────────── */
export const radius = {
  button: 14,
  card:   18,
  modal:  22,
  input:  14,
  sm:     10,
  md:     14,
  lg:     18,
  xl:     24,
  full:   9999,
};

/* ── Shadows ───────────────────────────────────────────── */
export const shadow = {
  card:    "0 4px 16px rgba(0,0,0,0.25), 0 0 0 0.5px rgba(255,255,255,0.04)",
  elevated:"0 10px 30px rgba(0,0,0,0.25), 0 0 0 0.5px rgba(255,255,255,0.05)",
  glow:    "0 0 24px rgba(109,124,255,0.06)",
  icon:    "0 10px 30px rgba(0,0,0,0.35), 0 0 40px rgba(109,124,255,0.08)",
};

/* ── Spacing (8px grid) ────────────────────────────────── */
export const space = { 0:0,1:4,2:8,3:12,4:16,5:20,6:24,8:32,10:40,12:48,16:64 };

/* ── Lightweight Motion ────────────────────────────────── */
export const motion = {
  fadeIn:    { initial:{opacity:0} as TargetAndTransition, animate:{opacity:1} as TargetAndTransition, transition:{duration:0.3,ease:"easeOut" as const} },
  slideUp:   { initial:{opacity:0,y:6} as TargetAndTransition, animate:{opacity:1,y:0} as TargetAndTransition, transition:{duration:0.25,ease:"easeOut" as const} },
  press:     { whileTap:{scale:0.97}, transition:{duration:0.1} },
  pageEnter: { initial:{opacity:0,y:4} as TargetAndTransition, animate:{opacity:1,y:0} as TargetAndTransition, transition:{duration:0.22,ease:"easeOut" as const} },
};

/* ── App Store Screenshot Dimensions ───────────────────── */
export const screenshot = {
  iphone65: { width: 1242, height: 2688 },  /* 6.5" (iPhone 14 Pro Max scale) */
  iphone61: { width: 1170, height: 2532 },  /* 6.1" (iPhone 14 Pro) */
};

/* ── App Icon Specifications ───────────────────────────── */
export const appIcon = {
  background: palette.background,
  ringColor:  palette.primarySoft,
  centerGlow: palette.primaryGlow,
  cornerRadius: 28, // App Store icon corner radius
  size: 1024,       // App Store required icon size
};
