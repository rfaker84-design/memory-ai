import { MemorySurface } from "../tokens/colors";
import { MemorySpacing } from "../tokens/spacing";
import { MemoryRadius } from "../tokens/radius";
import { MemoryShadow } from "../tokens/shadow";
import { MemoryTypography } from "../tokens/typography";
import { MemoryZIndex } from "../tokens/zIndex";
import { MemoryOpacity } from "../tokens/opacity";
import { MemoryMotion } from "../tokens/motion";

export const MemoryTheme = {
  surface: MemorySurface,
  spacing: MemorySpacing,
  radius: MemoryRadius,
  shadow: MemoryShadow,
  typography: MemoryTypography,
  zIndex: MemoryZIndex,
  opacity: MemoryOpacity,
  motion: MemoryMotion,
} as const;

export type MemoryThemeToken = typeof MemoryTheme;
