/* =========================================================================
   忆见 MemoryAI — Design Tokens (Warm Sync)
   Now re-exports from app-store-theme for consistency
   ========================================================================= */

import type { TargetAndTransition } from "framer-motion";

export const colors = {
  background:  "#0B0A08",
  surface:     "#1A1410",
  surface2:    "#201A15",
  overlay:     "rgba(11,10,8,0.94)",

  primary:        "#FFB37C",
  primarySoft:    "rgba(255,179,124,0.12)",
  primaryGlow:    "rgba(255,179,124,0.08)",
  accent:         "#FFD2A6",
  accentSoft:     "rgba(255,210,166,0.10)",

  textPrimary:   "#FFF3E8",
  textSecondary: "#D6BBA6",
  textMuted:     "rgba(214,187,166,0.40)",
  textInverse:   "#0B0A08",

  border:        "rgba(255,255,255,0.06)",
  borderLight:   "rgba(255,255,255,0.10)",
  borderPrimary: "rgba(255,179,124,0.22)",

  success: "#7BC67E",
  warning: "#F0B864",
  error:   "#E0736A",
  info:    "#FFB37C",
};

export const spacing = { xs:4,sm:8,md:12,lg:16,xl:20,"2xl":24,"3xl":32,"4xl":40,"5xl":48,"6xl":64 };
export const radius = { button:14,card:18,modal:22,input:14,sm:10,md:14,lg:18,xl:24,full:9999 };

export const shadows = {
  card:     "0 4px 16px rgba(0,0,0,0.30), 0 0 0 0.5px rgba(255,255,255,0.03)",
  elevated: "0 10px 30px rgba(0,0,0,0.30), 0 0 0 0.5px rgba(255,255,255,0.04)",
  button:   "0 0 0 0.5px rgba(255,179,124,0.15), 0 10px 30px rgba(0,0,0,0.30)",
  glow:     "0 0 24px rgba(255,179,124,0.06)",
};

export const motion = {
  pageTransition: { initial:{opacity:0,y:4} as TargetAndTransition, animate:{opacity:1,y:0} as TargetAndTransition, transition:{duration:0.22,ease:"easeOut" as const} },
  fadeIn:         { initial:{opacity:0} as TargetAndTransition, animate:{opacity:1} as TargetAndTransition, transition:{duration:0.25,ease:"easeOut" as const} },
  slideUp:        { initial:{opacity:0,y:6} as TargetAndTransition, animate:{opacity:1,y:0} as TargetAndTransition, transition:{duration:0.2,ease:"easeOut" as const} },
  pressDown:      { whileTap:{scale:0.97}, transition:{duration:0.1} },
};
