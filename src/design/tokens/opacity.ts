export const MemoryOpacity = {
  hidden: 0,
  disabled: 0.36,
  muted: 0.56,
  secondary: 0.72,
  primary: 0.92,
  full: 1,
  glass: 0.12,
  veil: 0.72,
} as const;

export type MemoryOpacityToken = typeof MemoryOpacity;
