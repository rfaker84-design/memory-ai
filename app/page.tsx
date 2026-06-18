"use client";

import { useState } from "react";
import SplashScreen from "../src/components/SplashScreen";
import WorldShell from "../components/world/WorldShell";

/* ============================================================
   忆见 MemoryAI — Single Entry
   Splash (2.4s) → WorldShell (four-tab dream space)
   ============================================================ */

export default function HomePage() {
  const [splashDone, setSplashDone] = useState(false);

  if (!splashDone) {
    return <SplashScreen onComplete={() => setSplashDone(true)} />;
  }

  return <WorldShell />;
}