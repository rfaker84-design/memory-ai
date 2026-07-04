export const MemorySurface = {
  background: {
    base: "#0E0B08",
    warm: "#15100B",
    elevated: "#1C150F",
    veil: "rgba(14, 11, 8, 0.72)",
  },
  content: {
    primary: "#F7EFE4",
    secondary: "#D9C7B3",
    muted: "#A89582",
    inverse: "#2A2017",
  },
  accent: {
    gold: "#C4A882",
    amber: "#D1A15F",
    skin: "#E8C7A5",
    warmWhite: "#FFF7EA",
  },
  state: {
    success: "#8FAE8A",
    warning: "#D1A15F",
    danger: "#C9786D",
    focus: "rgba(196, 168, 130, 0.38)",
  },
  border: {
    subtle: "rgba(247, 239, 228, 0.08)",
    warm: "rgba(196, 168, 130, 0.18)",
    strong: "rgba(196, 168, 130, 0.32)",
  },
} as const;

export const MemoryColors = MemorySurface;

export type MemorySurfaceToken = typeof MemorySurface;
export type MemoryColorsToken = typeof MemoryColors;
