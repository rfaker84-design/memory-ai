export const MemoryZIndex = {
  background: 0,
  atmosphere: 10,
  environment: 20,
  subject: 30,
  content: 40,
  interaction: 50,
  navigation: 60,
  overlay: 70,
  toast: 80,
  modal: 90,
} as const;

export type MemoryZIndexToken = typeof MemoryZIndex;
