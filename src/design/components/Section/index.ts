import { MemorySpacing, MemoryZIndex } from "../../tokens";

export const MemorySection = {
  page: {
    paddingInline: MemorySpacing.pageXMobile,
    paddingBlock: MemorySpacing.pageYMobile,
    zIndex: MemoryZIndex.content,
  },
  stack: {
    gap: MemorySpacing.sectionGap,
  },
  content: {
    gap: MemorySpacing.contentGap,
    maxWidth: "672px",
  },
} as const;

export type MemorySectionToken = typeof MemorySection;
