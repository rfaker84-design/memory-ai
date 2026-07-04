import type { HTMLAttributes, ReactNode } from "react";

import { MemorySection as MemorySectionTokens, MemorySpacing, MemorySurface, MemoryTypography } from "../../design";

export type MemorySectionProps = HTMLAttributes<HTMLElement> & {
  title?: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
};

export function MemorySection({ title, description, action, style, children, ...props }: MemorySectionProps) {
  return (
    <section
      {...props}
      style={{
        paddingInline: MemorySectionTokens.page.paddingInline,
        paddingBlock: MemorySpacing["3xl"],
        position: "relative",
        zIndex: MemorySectionTokens.page.zIndex,
        ...style,
      }}
    >
      {(title || description || action) && (
        <header
          style={{
            display: "flex",
            alignItems: "flex-end",
            justifyContent: "space-between",
            gap: MemorySpacing.lg,
            marginBottom: MemorySpacing.xl,
          }}
        >
          <div style={{ minWidth: 0 }}>
            {title && (
              <h2
                style={{
                  margin: 0,
                  color: MemorySurface.content.primary,
                  fontFamily: MemoryTypography.fontFamily.zh,
                  fontSize: MemoryTypography.size.title,
                  fontWeight: MemoryTypography.weight.medium,
                  letterSpacing: MemoryTypography.letterSpacing.title,
                  lineHeight: MemoryTypography.lineHeight.compact,
                }}
              >
                {title}
              </h2>
            )}
            {description && (
              <p
                style={{
                  margin: title ? `${MemorySpacing.sm} 0 0` : 0,
                  color: MemorySurface.content.muted,
                  fontFamily: MemoryTypography.fontFamily.zh,
                  fontSize: MemoryTypography.size.body,
                  lineHeight: MemoryTypography.lineHeight.normal,
                }}
              >
                {description}
              </p>
            )}
          </div>
          {action && <div>{action}</div>}
        </header>
      )}
      <div style={{ display: "grid", gap: MemorySpacing.contentGap }}>{children}</div>
    </section>
  );
}
