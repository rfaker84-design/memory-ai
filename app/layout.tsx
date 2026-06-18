import type { Metadata } from "next";
import { Noto_Sans_SC, Noto_Serif_SC } from "next/font/google";
import MobileAppShell from "../src/components/MobileAppShell";
import "./globals.css";

const notoSansSC = Noto_Sans_SC({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
  variable: "--font-noto-sans-sc",
  display: "swap",
});

const notoSerifSC = Noto_Serif_SC({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-noto-serif-sc",
  display: "swap",
});

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
  themeColor: "#F6F1E8",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN" style={{ colorScheme: "light" }}>
      <body className={`${notoSansSC.variable} ${notoSerifSC.variable} antialiased`}
        style={{ background: "var(--bg-warm, #F6F1E8)", margin: 0, padding: 0 }}>
        <MobileAppShell>{children}</MobileAppShell>
      </body>
    </html>
  );
}