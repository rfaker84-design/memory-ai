import { MemoryShadow, MemorySurface } from "../../tokens";

export const MemorySurfaceComponent = {
  page: {
    background: MemorySurface.background.base,
    color: MemorySurface.content.primary,
  },
  warmLayer: {
    background: MemorySurface.background.warm,
    color: MemorySurface.content.primary,
  },
  glass: {
    background: "rgba(247, 239, 228, 0.06)",
    borderColor: MemorySurface.border.subtle,
    boxShadow: MemoryShadow.insetSurface,
  },
  veil: {
    background: MemorySurface.background.veil,
  },
} as const;

export type MemorySurfaceComponentToken = typeof MemorySurfaceComponent;
