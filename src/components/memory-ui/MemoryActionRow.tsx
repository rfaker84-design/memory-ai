import type { CSSProperties, HTMLAttributes } from "react";

import { MemorySpacing } from "../../design";

export type MemoryActionRowProps = HTMLAttributes<HTMLDivElement> & {
  align?: "start" | "center" | "end" | "stretch";
};

const alignItems = {
  start: "flex-start",
  center: "center",
  end: "flex-end",
  stretch: "stretch",
} as const;

export function MemoryActionRow({ align = "stretch", style, children, ...props }: MemoryActionRowProps) {
  return (
    <div
      {...props}
      style={{
        display: "flex",
        flexWrap: "wrap",
        alignItems: alignItems[align],
        gap: MemorySpacing.md,
        width: "100%",
        ...style,
      }}
    >
      {children}
    </div>
  );
}

