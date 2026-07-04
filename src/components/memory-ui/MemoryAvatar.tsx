import type { HTMLAttributes } from "react";

import { MemoryRadius, MemoryShadow, MemorySpacing, MemorySurface, MemoryTypography } from "../../design";

type Presence = "none" | "online" | "quiet" | "away";

export type MemoryAvatarProps = HTMLAttributes<HTMLDivElement> & {
  image?: string | null;
  initials?: string;
  alt?: string;
  presence?: Presence;
  size?: number;
};

const presenceColor: Record<Presence, string> = {
  none: "transparent",
  online: MemorySurface.state.success,
  quiet: MemorySurface.accent.gold,
  away: MemorySurface.content.muted,
};

export function MemoryAvatar({ image, initials, alt = "", presence = "none", size = 56, style, ...props }: MemoryAvatarProps) {
  const fallback = initials?.slice(0, 2).trim() || "忆";

  return (
    <div
      {...props}
      style={{
        position: "relative",
        width: size,
        height: size,
        flex: "0 0 auto",
        borderRadius: MemoryRadius.avatar,
        background: MemorySurface.background.elevated,
        boxShadow: MemoryShadow.glowSoft,
        overflow: "hidden",
        display: "grid",
        placeItems: "center",
        color: MemorySurface.content.secondary,
        fontFamily: MemoryTypography.fontFamily.zh,
        fontSize: Math.max(14, size * 0.34),
        ...style,
      }}
    >
      {image ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={image} alt={alt} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
      ) : (
        <span>{fallback}</span>
      )}
      {presence !== "none" && (
        <span
          aria-hidden="true"
          style={{
            position: "absolute",
            right: MemorySpacing.xs,
            bottom: MemorySpacing.xs,
            width: Math.max(10, size * 0.18),
            height: Math.max(10, size * 0.18),
            borderRadius: MemoryRadius.full,
            background: presenceColor[presence],
            border: `2px solid ${MemorySurface.background.elevated}`,
          }}
        />
      )}
    </div>
  );
}
