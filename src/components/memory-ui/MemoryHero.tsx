import type { HTMLAttributes, ReactNode } from "react";

import { MemorySpacing, MemorySurface, MemoryTypography, MemoryZIndex } from "../../design";

export type MemoryHeroProps = HTMLAttributes<HTMLDivElement> & {
  eyebrow?: ReactNode;
  title?: ReactNode;
  description?: ReactNode;
  media?: ReactNode;
  actions?: ReactNode;
};

export function MemoryHero({ eyebrow, title, description, media, actions, style, children, ...props }: MemoryHeroProps) {
  return (
    <div
      {...props}
      style={{
        position: "relative",
        zIndex: MemoryZIndex.content,
        display: "grid",
        gap: MemorySpacing["2xl"],
        paddingInline: MemorySpacing.pageXMobile,
        paddingBlock: `calc(${MemorySpacing.pageYMobile} + ${MemorySpacing.safeTop}) ${MemorySpacing["4xl"]}`,
        ...style,
      }}
    >
      {media && <div style={{ position: "relative", zIndex: MemoryZIndex.subject }}>{media}</div>}
      <div style={{ display: "grid", gap: MemorySpacing.lg, maxWidth: 720 }}>
        {eyebrow && (
          <div
            style={{
              color: MemorySurface.accent.gold,
              fontFamily: MemoryTypography.fontFamily.zh,
              fontSize: MemoryTypography.size.meta,
              lineHeight: MemoryTypography.lineHeight.compact,
            }}
          >
            {eyebrow}
          </div>
        )}
        {title && (
          <h1
            style={{
              margin: 0,
              color: MemorySurface.content.primary,
              fontFamily: MemoryTypography.fontFamily.zh,
              fontSize: MemoryTypography.size.hero,
              fontWeight: MemoryTypography.weight.medium,
              letterSpacing: MemoryTypography.letterSpacing.title,
              lineHeight: MemoryTypography.lineHeight.compact,
            }}
          >
            {title}
          </h1>
        )}
        {description && (
          <p
            style={{
              margin: 0,
              color: MemorySurface.content.secondary,
              fontFamily: MemoryTypography.fontFamily.zh,
              fontSize: MemoryTypography.size.bodyLarge,
              lineHeight: MemoryTypography.lineHeight.relaxed,
            }}
          >
            {description}
          </p>
        )}
        {actions && <div style={{ marginTop: MemorySpacing.sm }}>{actions}</div>}
        {children}
      </div>
    </div>
  );
}
