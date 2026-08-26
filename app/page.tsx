"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";

import { GuestExperience } from "../components/world/GuestExperience";
import { OriginalHomeLogin } from "../components/world/OriginalHomeLogin";
import { fetchAuthRequestJson } from "../src/components/auth/authRequestClient";
import StaticBrandLaunch from "../src/components/launch/StaticBrandLaunch";
import { MotionProvider } from "../src/motion";

type HomeStage = "launch" | "home" | "login";
type LoginIntent = "login" | "create";

/**
 * The public root is intentionally self-contained: it plays the approved
 * opening, then mounts the approved five-person carousel in place. It never
 * restores a former route or reads an Owner memory during startup.
 */
export default function HomePage() {
  const router = useRouter();
  const [stage, setStage] = useState<HomeStage>("launch");
  const [loginIntent, setLoginIntent] = useState<LoginIntent>("login");

  const enterHome = useCallback(() => setStage("home"), []);

  const openLogin = useCallback(() => {
    setLoginIntent("login");
    setStage("login");
  }, []);

  const beginCreation = useCallback(async () => {
    try {
      const { response, body } = await fetchAuthRequestJson("/api/auth/session", {
        cache: "no-store",
        credentials: "same-origin",
      });
      if (response.ok && (body as { authenticated?: unknown }).authenticated === true) {
        router.push("/create-memory");
        return;
      }
    } catch {
      // A transient session read must not turn a deliberate create action
      // into a dead end. The established contextual login can recover it.
    }
    setLoginIntent("create");
    setStage("login");
  }, [router]);

  const completeAuthentication = useCallback(() => {
    if (loginIntent === "create") {
      router.replace("/create-memory");
      return;
    }
    setStage("home");
  }, [loginIntent, router]);

  return (
    <MotionProvider>
      {stage === "launch" && <StaticBrandLaunch onComplete={enterHome} ready />}
      {stage === "home" && <GuestExperience onLogin={openLogin} onStart={beginCreation} />}
      {stage === "login" && (
        <OriginalHomeLogin
          onAuthenticated={completeAuthentication}
          onBackToExperience={() => setStage("home")}
        />
      )}
    </MotionProvider>
  );
}
