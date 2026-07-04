export const MemorySpacing = {
  none: "0px",
  px: "1px",
  xs: "4px",
  sm: "8px",
  md: "12px",
  lg: "16px",
  xl: "20px",
  "2xl": "24px",
  "3xl": "32px",
  "4xl": "40px",
  "5xl": "48px",
  "6xl": "64px",
  pageXMobile: "24px",
  pageYMobile: "48px",
  sectionGap: "32px",
  contentGap: "16px",
  safeBottom: "env(safe-area-inset-bottom)",
  safeTop: "env(safe-area-inset-top)",
} as const;

export type MemorySpacingToken = typeof MemorySpacing;
