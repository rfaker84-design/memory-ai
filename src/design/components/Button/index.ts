import { MemoryMotion, MemoryRadius, MemoryShadow, MemorySpacing, MemorySurface, MemoryTypography } from "../../tokens";

export const MemoryButton = {
  base: {
    minHeight: MemorySpacing["5xl"],
    paddingInline: MemorySpacing["2xl"],
    borderRadius: MemoryRadius.control,
    fontSize: MemoryTypography.size.body,
    fontWeight: MemoryTypography.weight.medium,
    transitionDuration: `${MemoryMotion.duration.feedback}ms`,
    transitionTimingFunction: MemoryMotion.ease.standard,
  },
  variants: {
    primary: {
      color: MemorySurface.content.inverse,
      background: "rgba(196, 168, 130, 0.88)",
      boxShadow: MemoryShadow.glowWarm,
    },
    quiet: {
      color: MemorySurface.content.secondary,
      background: "rgba(247, 239, 228, 0.06)",
      boxShadow: MemoryShadow.insetSurface,
    },
    ghost: {
      color: MemorySurface.content.secondary,
      background: "transparent",
      boxShadow: MemoryShadow.none,
    },
  },
} as const;

export type MemoryButtonToken = typeof MemoryButton;
