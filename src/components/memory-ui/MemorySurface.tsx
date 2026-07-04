import type { CSSProperties, HTMLAttributes } from "react";

import { MemoryShadow, MemorySurface as MemorySurfaceTokens } from "../../design";

type MemorySurfaceVariant = "background" | "elevated" | "glass" | "quiet";

export type MemorySurfaceProps = HTMLAttributes<HTMLDivElement> & {
  variant?: MemorySurfaceVariant;
};

const variantStyles: Record<MemorySurfaceVariant, CSSProperties> = {
  background: {
    background: MemorySurfaceTokens.background.base,
    color: MemorySurfaceTokens.content.primary,
  },
  elevated: {
    background: MemorySurfaceTokens.background.elevated,
    color: MemorySurfaceTokens.content.primary,
    boxShadow: MemoryShadow.ambient,
  },
  glass: {
    background: "rgba(247, 239, 228, 0.06)",
    border: `1px solid ${MemorySurfaceTokens.border.subtle}`,
    boxShadow: MemoryShadow.insetSurface,
  },
  quiet: {
    background: "transparent",
    color: MemorySurfaceTokens.content.secondary,
  },
};

export function MemorySurface({ variant = "background", style, children, ...props }: MemorySurfaceProps) {
  return (
    <div
      {...props}
      style={{
        minWidth: 0,
        ...variantStyles[variant],
        ...style,
      }}
    >
      {children}
    </div>
  );
}

