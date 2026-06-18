/* =========================================================================
   忆见 MemoryAI — UI Root Theme
   Single source of truth · Warm Emotional · App Store Aligned
   All other theme files derive from this one.
   ========================================================================= */

export const ROOT_THEME = {
  background:  "#0B0A08",
  surface:     "#1A1410",
  surface2:    "#201A15",
  overlay:     "rgba(11,10,8,0.94)",

  primary:     "#FFB37C",
  primarySoft: "rgba(255,179,124,0.12)",
  primaryGlow: "rgba(255,179,124,0.10)",
  accent:      "#FFD2A6",
  accentSoft:  "rgba(255,210,166,0.10)",

  textPrimary:   "#FFF3E8",
  textSecondary: "#D6BBA6",
  textMuted:     "rgba(214,187,166,0.40)",

  border:        "rgba(255,255,255,0.06)",
  borderLight:   "rgba(255,255,255,0.10)",
  borderPrimary: "rgba(255,179,124,0.22)",
} as const;

export const ROOT_SPACING = { xs:4, sm:8, md:12, lg:16, xl:20, "2xl":24, "3xl":32 } as const;
export const ROOT_RADIUS  = { button:14, card:18, modal:22, input:14 } as const;
export const ROOT_SHADOW  = { card: "0 4px 16px rgba(0,0,0,0.30)", elevated: "0 10px 30px rgba(0,0,0,0.30)", glow: "0 0 30px rgba(255,179,124,0.08)" } as const;
