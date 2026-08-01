import type { Metadata } from "next";
import MobileAppShell from "../src/components/MobileAppShell";
import "./globals.css";
import { RootDocument } from "./root-document";

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
  themeColor: "#0B0A08",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <RootDocument>
      <MobileAppShell>{children}</MobileAppShell>
    </RootDocument>
  );
}
