import { MemoryRadius, MemoryShadow, MemorySpacing, MemorySurface } from "../../tokens";

export const MemoryCard = {
  base: {
    padding: MemorySpacing["2xl"],
    borderRadius: MemoryRadius.card,
    background: "rgba(247, 239, 228, 0.055)",
    borderColor: MemorySurface.border.subtle,
    boxShadow: `${MemoryShadow.card}, ${MemoryShadow.insetSurface}`,
  },
  elevated: {
    background: "rgba(247, 239, 228, 0.075)",
    borderColor: MemorySurface.border.warm,
    boxShadow: `${MemoryShadow.ambient}, ${MemoryShadow.insetSurface}`,
  },
} as const;

export type MemoryCardToken = typeof MemoryCard;
