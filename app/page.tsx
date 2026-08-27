"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";

import { GuestExperience } from "../components/world/GuestExperience";
import { OriginalHomeLogin } from "../components/world/OriginalHomeLogin";
import { MotionProvider } from "../src/motion";

type HomeStage = "home" | "login";

/**
 * The approved opening is shown once per public browser session by the
 * layout-level PublicBrandLaunchGate. This root then mounts the approved
 * five-person carousel in place; it never restores a former route or reads
 * an Owner memory during startup.
 */
export default function HomePage() {
  const router = useRouter();
  const [stage, setStage] = useState<HomeStage>("home");

  const openLogin = useCallback(() => {
    setStage("login");
  }, []);

  const beginCreation = useCallback(() => {
    // The public first step intentionally has no session check. It is local
    // only, and asks for login precisely at the first upload/save boundary.
    router.push("/guest/create");
  }, [router]);

  const completeAuthentication = useCallback(() => {
    setStage("home");
  }, []);

  return (
    <MotionProvider>
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
