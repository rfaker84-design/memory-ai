"use client";

import { useCallback, useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";

import { FirstPresenceFlow } from "../src/components/first-presence/FirstPresenceFlow";
import { resolvePostLoginDestination } from "../src/components/auth/postLoginDestination";
import StaticBrandLaunch from "../src/components/launch/StaticBrandLaunch";
import { claimBrandLaunch } from "../src/components/launch/staticBrandLaunchPolicy";
import { MotionProvider } from "../src/motion";

function HomeLoadingFallback() {
  return (
    <main
      role="status"
      aria-live="polite"
      aria-label="正在准备忆见"
      style={{ minHeight: "100dvh", display: "grid", placeItems: "center", alignContent: "center", gap: 10, background: "#0B0A08", color: "#F6EEE2" }}
    >
      <strong style={{ fontSize: 24, letterSpacing: "0.16em" }}>忆见</strong>
      <span style={{ color: "#D5B172", fontSize: 14 }}>正在准备陪伴空间…</span>
    </main>
  );
}

const OriginalHomeLogin = dynamic(
  () => import("../components/world/OriginalHomeLogin").then((module) => module.OriginalHomeLogin),
  { ssr: false, loading: () => <HomeLoadingFallback /> }
);

const VISUAL_PREVIEW_ENABLED = process.env.NODE_ENV !== "production" && process.env.NEXT_PUBLIC_MEMORYAI_ENABLE_PRESENCE_PREVIEW === "true";

type EntryStage = "checking" | "launch" | "home" | "preview";

export default function HomePage() {
  const router = useRouter();
  const [stage, setStage] = useState<EntryStage>("checking");

  useEffect(() => {
    setStage(claimBrandLaunch(window.sessionStorage) ? "launch" : "home");
  }, []);

  const completeLaunch = useCallback(() => setStage((current) => current === "launch" ? "home" : current), []);
  const enterOwnerProduct = useCallback(async () => {
    const destination = await resolvePostLoginDestination();
    router.replace(destination);
  }, [router]);
  const homeIsMounted = stage === "launch" || stage === "home";

  return (
    <MotionProvider>
      {homeIsMounted && <OriginalHomeLogin onAuthenticated={enterOwnerProduct} onPreview={VISUAL_PREVIEW_ENABLED ? () => setStage("preview") : undefined} />}
      {stage === "checking" && <HomeLoadingFallback />}
      {stage === "launch" && <StaticBrandLaunch onComplete={completeLaunch} />}
      {stage === "preview" && <FirstPresenceFlow initialStage="preview-create" onLeaveHome={() => setStage("home")} />}
    </MotionProvider>
  );
}
