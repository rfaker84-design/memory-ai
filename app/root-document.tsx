import React, { type ReactNode } from "react";

/**
 * Keeps the document element tolerant of the verified iOS/WeChat WebView
 * mutation that can add `-webkit-touch-callout` before React hydrates.
 *
 * This is intentionally scoped to the document element: React still reports
 * hydration mismatches for the body and every application component.
 */
export function RootDocument({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="zh-CN" suppressHydrationWarning>
      <body
        className="antialiased"
        style={{ background: "#0B0A08", margin: 0, padding: 0 }}
      >
        {children}
      </body>
    </html>
  );
}
