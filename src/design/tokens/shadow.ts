export const MemoryShadow = {
  none: "none",
  ambient: "0 24px 80px rgba(0, 0, 0, 0.38)",
  card: "0 18px 48px rgba(0, 0, 0, 0.28)",
  glowWarm: "0 0 42px rgba(196, 168, 130, 0.18)",
  glowSoft: "0 0 64px rgba(232, 199, 165, 0.12)",
  insetSurface: "inset 0 1px 0 rgba(255, 247, 234, 0.06)",
  focus: "0 0 0 3px rgba(196, 168, 130, 0.28)",
} as const;

export type MemoryShadowToken = typeof MemoryShadow;
