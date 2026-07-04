export const MemoryTypography = {
  fontFamily: {
    sans: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    zh: '"PingFang SC", "Microsoft YaHei", system-ui, sans-serif',
  },
  size: {
    caption: "12px",
    meta: "13px",
    body: "15px",
    bodyLarge: "16px",
    title: "22px",
    hero: "32px",
  },
  lineHeight: {
    compact: "1.25",
    normal: "1.55",
    relaxed: "1.75",
  },
  weight: {
    regular: 400,
    medium: 500,
    semibold: 600,
  },
  letterSpacing: {
    calm: "0.01em",
    title: "-0.02em",
  },
} as const;

export type MemoryTypographyToken = typeof MemoryTypography;
