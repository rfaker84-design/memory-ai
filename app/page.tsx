"use client";

import { useCallback } from "react";
import { useRouter } from "next/navigation";

import StaticBrandLaunch from "../src/components/launch/StaticBrandLaunch";
import { MotionProvider } from "../src/motion";

/**
 * The root has one job: play the established brand opening, then enter the
 * fixed product home. It must not inspect a session, recover a former route,
 * or select an Owner memory.
 */
export default function HomePage() {
  const router = useRouter();
  const enterHome = useCallback(() => {
    router.replace("/companion");
  }, [router]);

  return (
    <MotionProvider>
      <StaticBrandLaunch onComplete={enterHome} ready />
    </MotionProvider>
  );
}
