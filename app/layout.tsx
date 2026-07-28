import type { Metadata } from "next";
import MobileAppShell from "../src/components/MobileAppShell";
import "./globals.css";

export const metadata: Metadata = {
  title: "忆见",
  description: "让思念，被温柔记录",
  manifest: "/manifest.json",
  icons: { icon: "/icon-192.png", apple: "/icon-512.png" },
  appleWebApp: { capable: true, statusBarStyle: "default", title: "忆见" },
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  themeColor: "#0B0A08",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN">
      <body className="antialiased"
        style={{ background: "#0B0A08", margin: 0, padding: 0 }}>
        <MobileAppShell>{children}</MobileAppShell>
      </body>
    </html>
  );
}
