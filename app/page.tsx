"use client";

import { useCallback, useEffect, useState } from "react";
import dynamic from "next/dynamic";

import { FirstPresenceFlow } from "../src/components/first-presence/FirstPresenceFlow";
import StaticBrandLaunch from "../src/components/launch/StaticBrandLaunch";
import { claimBrandLaunch } from "../src/components/launch/staticBrandLaunchPolicy";
import { MotionProvider } from "../src/motion";

const OriginalHomeLogin = dynamic(
  () => import("../components/world/WorldShell").then((module) => module.OriginalHomeLogin),
  { ssr: false, loading: () => <div style={{ minHeight: "100dvh", background: "#0B0A08" }} /> }
);

const VISUAL_PREVIEW_ENABLED = process.env.NODE_ENV !== "production" && process.env.NEXT_PUBLIC_MEMORYAI_ENABLE_PRESENCE_PREVIEW === "true";

type EntryStage = "checking" | "launch" | "home" | "presence" | "preview";

export default function HomePage() {
  const [stage, setStage] = useState<EntryStage>("checking");

  useEffect(() => {
    setStage(claimBrandLaunch(window.sessionStorage) ? "launch" : "home");
  }, []);

  const completeLaunch = useCallback(() => setStage((current) => current === "launch" ? "home" : current), []);
  const homeIsMounted = stage === "checking" || stage === "launch" || stage === "home";

  return (
    <MotionProvider>
      {homeIsMounted && <OriginalHomeLogin onAuthenticated={() => setStage("presence")} onPreview={VISUAL_PREVIEW_ENABLED ? () => setStage("preview") : undefined} />}
      {stage === "checking" && <div aria-hidden="true" style={{ position: "fixed", inset: 0, zIndex: 9999, background: "#0B0A08" }} />}
      {stage === "launch" && <StaticBrandLaunch onComplete={completeLaunch} />}
      {stage === "presence" && <FirstPresenceFlow initialStage="create" onLeaveHome={() => setStage("home")} />}
      {stage === "preview" && <FirstPresenceFlow onLeaveHome={() => setStage("home")} />}
    </MotionProvider>
  );
}
