import type { Metadata } from "next";
import MobileAppShell from "../src/components/MobileAppShell";
import { GuestCreateContinuationProvider } from "../src/components/create-memory/GuestCreateContinuationProvider";
// Kept mounted for build-contract compatibility; the provider is product-paused and renders no audio UI.\nimport { SoundscapeProvider } from "../src/features/soundscape/SoundscapeProvider";
import "./globals.css";
import { RootDocument } from "./root-document";

export const metadata: Metadata = {
  title: "忆见",
  description: "AI生成 · 基于你确认的信息",
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
      <SoundscapeProvider>
        <GuestCreateContinuationProvider>
          <MobileAppShell>{children}</MobileAppShell>
        </GuestCreateContinuationProvider>
      </SoundscapeProvider>
    </RootDocument>
  );
}
