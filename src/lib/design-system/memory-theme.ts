/* ════════════════════════════════════════════════════════
   忆见 MemoryAI — Visual System V1
   温暖疗愈 · 低饱和暖色 · Apple极简 · 情绪记忆感
   ════════════════════════════════════════════════════════ */

export const MemoryTheme = {
  colors: {
    bg:         "#F6F1E8",
    bgWarm:     "#F2EBE0",
    card:       "#FFFFFF",
    cardHover:  "#FAF7F2",
    primary:    "#D6A86E",
    primarySoft:"#E8D5B8",
    secondary:  "#E8C9A8",
    accent:     "#C4945A",
    text:       "#2C2A28",
    textMuted:  "#8A847E",
    textFaint:  "#B5AFA8",
    border:     "rgba(0,0,0,0.06)",
    borderLight:"rgba(0,0,0,0.04)",
    success:    "#7BA87E",
    warning:    "#D4A85C",
    error:      "#C0706A",
  },

  glow: {
    color:      "rgba(214,168,110,0.15)",
    soft:       "0 0 20px rgba(214,168,110,0.08)",
    medium:     "0 0 40px rgba(214,168,110,0.12)",
    ambient:    "radial-gradient(ellipse at 50% 35%, rgba(214,168,110,0.08) 0%, transparent 60%)",
  },

  radius: {
    sm: 10,
    md: 14,
    lg: 18,
    xl: 22,
    full: 9999,
  },

  shadow: {
    card:    "0 2px 12px rgba(0,0,0,0.04), 0 0 0 0.5px rgba(0,0,0,0.03)",
    elevated:"0 4px 20px rgba(0,0,0,0.06), 0 0 0 0.5px rgba(0,0,0,0.04)",
    button:  "0 1px 4px rgba(0,0,0,0.06)",
  },

  spacing: {
    xs: 4,
    sm: 8,
    md: 12,
    lg: 16,
    xl: 20,
    xxl: 24,
    xxxl: 32,
  },

  typography: {
    fontFamily: '"SF Pro Display","PingFang SC","Hiragino Sans GB","Microsoft YaHei",ui-sans-serif,system-ui,sans-serif',
    title:    { size: "clamp(32px,9vw,48px)", weight: 700, letterSpacing: "-0.02em" },
    subtitle: { size: "clamp(13px,3.5vw,15px)", weight: 400, letterSpacing: "0.04em" },
    body:     { size: 15, weight: 400, lineHeight: 1.7 },
    caption:  { size: 12, weight: 400, letterSpacing: "0.06em" },
  },

  animation: {
    fadeIn:       { duration: 0.4, ease: "easeOut" },
    fadeUp:       { duration: 0.35, ease: "easeOut" },
    breathing:    { duration: 8, ease: "easeInOut" },
    pressScale:   { scale: 0.97, duration: 0.1 },
  },

  style: "apple-soft-minimal-memory-warm-healing",
} as const;

/* ── Glass Effect (warm version) ─────────────────────── */
export const WarmGlass = {
  card:  "backdrop-filter:blur(16px);-webkit-backdrop-filter:blur(16px);border:0.5px solid rgba(255,255,255,0.6);background:rgba(255,255,255,0.75)",
  input: "backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px);border:0.5px solid rgba(0,0,0,0.06);background:rgba(255,255,255,0.85)",
} as const;

/* ── Motion Presets ──────────────────────────────────── */
export const WarmMotion = {
  enter:  { initial: { opacity: 0, y: 4 }, animate: { opacity: 1, y: 0 }, transition: { duration: 0.35, ease: "easeOut" as const } },
  fadeIn: { initial: { opacity: 0 }, animate: { opacity: 1 }, transition: { duration: 0.4, ease: "easeOut" as const } },
  press:  { whileTap: { scale: 0.97 }, transition: { duration: 0.1 } },
} as const;