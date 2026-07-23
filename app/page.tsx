"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";

import SplashScreen from "../src/components/SplashScreen";
import { FirstPresenceFlow } from "../src/components/first-presence/FirstPresenceFlow";
import { MotionProvider } from "../src/motion";

const OriginalHomeLogin = dynamic(
  () => import("../components/world/WorldShell").then((module) => module.OriginalHomeLogin),
  { ssr: false, loading: () => <div style={{ minHeight: "100dvh", background: "#0B0A08" }} /> }
);

const SPLASH_KEY = "memoryai:sprint17:original-home-splash-seen";
const VISUAL_PREVIEW_ENABLED = process.env.NODE_ENV !== "production" && process.env.NEXT_PUBLIC_MEMORYAI_ENABLE_PRESENCE_PREVIEW === "true";

type EntryStage = "checking" | "splash" | "home" | "presence" | "preview";

export default function HomePage() {
  const [stage, setStage] = useState<EntryStage>("checking");

  useEffect(() => {
    setStage(window.sessionStorage.getItem(SPLASH_KEY) === "1" ? "home" : "splash");
  }, []);

  const completeSplash = () => {
    window.sessionStorage.setItem(SPLASH_KEY, "1");
    setStage("home");
  };

  return (
    <MotionProvider>
      {stage === "checking" && <div style={{ minHeight: "100dvh", background: "#000" }} />}
      {stage === "splash" && <SplashScreen onComplete={completeSplash} />}
      {stage === "home" && <OriginalHomeLogin onAuthenticated={() => setStage("presence")} onPreview={VISUAL_PREVIEW_ENABLED ? () => setStage("preview") : undefined} />}
      {stage === "presence" && <FirstPresenceFlow initialStage="create" onLeaveHome={() => setStage("home")} />}
      {stage === "preview" && <FirstPresenceFlow onLeaveHome={() => setStage("home")} />}
    </MotionProvider>
  );
}
