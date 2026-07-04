export const MemoryRadius = {
  none: "0px",
  xs: "6px",
  sm: "10px",
  md: "14px",
  lg: "18px",
  xl: "24px",
  "2xl": "30px",
  full: "9999px",
  card: "24px",
  control: "18px",
  sheet: "30px",
  avatar: "9999px",
} as const;

export type MemoryRadiusToken = typeof MemoryRadius;
