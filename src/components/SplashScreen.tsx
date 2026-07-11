"use client";

import { useEffect, useMemo, useState } from "react";

interface SplashScreenProps {
  onComplete: () => void;
}

const PHASE = {
  black: 0,
  atmosphere: 600,
  presence: 1400,
  brand: 2200,
  done: 3000,
  hardStop: 3200,
} as const;

function usePrefersReducedMotion() {
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(query.matches);
    const onChange = (event: MediaQueryListEvent) => setReduced(event.matches);
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, []);

  return reduced;
}

export default function SplashScreen({ onComplete }: SplashScreenProps) {
  const reducedMotion = usePrefersReducedMotion();
  const [phase, setPhase] = useState<"black" | "atmosphere" | "presence" | "brand">("black");

  useEffect(() => {
    const timers = reducedMotion
      ? [window.setTimeout(() => setPhase("brand"), 80), window.setTimeout(onComplete, 520)]
      : [
          window.setTimeout(() => setPhase("atmosphere"), PHASE.atmosphere),
          window.setTimeout(() => setPhase("presence"), PHASE.presence),
          window.setTimeout(() => setPhase("brand"), PHASE.brand),
          window.setTimeout(onComplete, PHASE.done),
          window.setTimeout(onComplete, PHASE.hardStop),
        ];

    return () => timers.forEach((timer) => window.clearTimeout(timer));
  }, [onComplete, reducedMotion]);

  const showAtmosphere = phase === "atmosphere" || phase === "presence" || phase === "brand";
  const showPresence = phase === "presence" || phase === "brand";
  const showBrand = phase === "brand";

  const transition = useMemo(
    () => reducedMotion ? "opacity 160ms ease-out" : "opacity 720ms cubic-bezier(0.16, 1, 0.3, 1), transform 720ms cubic-bezier(0.16, 1, 0.3, 1)",
    [reducedMotion]
  );

  return (
    <div
      role="presentation"
      aria-hidden="true"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 200,
        overflow: "hidden",
        background: "#000000",
        color: "#FFF7EA",
      }}
    >
      <div
        style={{
          position: "absolute",
          inset: 0,
          opacity: showAtmosphere ? 1 : 0,
          transition,
          background: "radial-gradient(circle at 50% 42%, rgba(196,168,130,0.18), rgba(12,9,7,0.68) 38%, #000 74%)",
        }}
      />
      <div
        style={{
          position: "absolute",
          left: "50%",
          top: "42%",
          width: 168,
          height: 212,
          borderRadius: "48% 48% 42% 42%",
          transform: `translate(-50%, -50%) scale(${showPresence ? 1 : 0.96})`,
          opacity: showPresence ? 0.72 : 0,
          transition,
          background: "linear-gradient(180deg, rgba(255,247,234,0.16), rgba(196,168,130,0.05))",
          boxShadow: "0 0 72px rgba(232,199,165,0.14)",
          filter: reducedMotion ? "none" : "blur(0.2px)",
        }}
      />
      <div
        style={{
          position: "absolute",
          left: "50%",
          top: "61%",
          width: "min(76vw, 340px)",
          transform: `translate(-50%, ${showBrand ? "0" : "8px"})`,
          opacity: showBrand ? 1 : 0,
          transition,
          textAlign: "center",
        }}
      >
        <div style={{ fontSize: 28, letterSpacing: "0.12em", fontWeight: 500 }}>忆见</div>
        <div style={{ marginTop: 10, fontSize: 13, color: "rgba(217,199,179,0.76)", letterSpacing: "0.08em" }}>让重要的人，继续被听见</div>
      </div>
    </div>
  );
}
