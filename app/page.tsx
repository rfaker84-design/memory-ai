"use client";

import { useCallback, useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";

import { FirstPresenceFlow } from "../src/components/first-presence/FirstPresenceFlow";
import { resolvePostLoginDestination } from "../src/components/auth/postLoginDestination";
import { fetchAuthRequestJson } from "../src/components/auth/authRequestClient";
import StaticBrandLaunch from "../src/components/launch/StaticBrandLaunch";
import { claimBrandLaunch } from "../src/components/launch/staticBrandLaunchPolicy";
import { MotionProvider } from "../src/motion";
import { GuestExperience } from "../components/world/GuestExperience";

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

type EntryStage = "checking" | "launch" | "guest" | "login" | "preview";
type SessionPayload = { authenticated?: unknown };
type EntryResolution = "guest" | "/create-memory" | "/memory-world" | null;

export default function HomePage() {
  const router = useRouter();
  const [stage, setStage] = useState<EntryStage>("launch");
  const [entryResolution, setEntryResolution] = useState<EntryResolution>(null);
  const [launchComplete, setLaunchComplete] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    const showLaunch = claimBrandLaunch(window.sessionStorage);
    if (!showLaunch) {
      setLaunchComplete(true);
      setStage("checking");
    }

    void fetchAuthRequestJson("/api/auth/session", {
      cache: "no-store",
      credentials: "same-origin",
    }, fetch, controller.signal).then(async ({ response, body }) => {
      const payload = body as SessionPayload;
      if (response.ok && payload.authenticated === true) {
        const destination = await resolvePostLoginDestination(fetch, controller.signal);
        if (!controller.signal.aborted) setEntryResolution(destination);
        return;
      }
      if (!controller.signal.aborted) setEntryResolution("guest");
    }).catch(() => {
      if (!controller.signal.aborted) setEntryResolution("guest");
    });

    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (!launchComplete || entryResolution === null) return;
    if (entryResolution === "guest") {
      setStage("guest");
      return;
    }
    router.replace(entryResolution);
  }, [entryResolution, launchComplete, router]);

  const completeLaunch = useCallback(() => setLaunchComplete(true), []);
  const enterOwnerProduct = useCallback(async () => {
    const destination = await resolvePostLoginDestination();
    router.replace(destination);
  }, [router]);

  return (
    <MotionProvider>
      {stage === "checking" && <HomeLoadingFallback />}
      {stage === "launch" && <StaticBrandLaunch onComplete={completeLaunch} ready={entryResolution !== null} />}
      {stage === "guest" && <GuestExperience onLogin={() => setStage("login")} />}
      {stage === "login" && <OriginalHomeLogin onAuthenticated={enterOwnerProduct} onBackToExperience={() => setStage("guest")} onPreview={VISUAL_PREVIEW_ENABLED ? () => setStage("preview") : undefined} />}
      {stage === "preview" && <FirstPresenceFlow initialStage="preview-create" onLeaveHome={() => setStage("guest")} />}
    </MotionProvider>
  );
}
