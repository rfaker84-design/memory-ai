"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import gsap from "gsap";
import type { LifeCreationState } from "./types";
import { PresenceSpace } from "./components/PresenceSpace";
import { HeartLight } from "./components/HeartLight";
import { PresenceParticles } from "./components/PresenceParticles";
import { SoulSilhouette } from "./components/SoulSilhouette";
import { LightLoginPanel } from "./components/LightLoginPanel";
import "./life-creation-stage.css";

export function LifeCreationStage() {
  const [state, setState] = useState<LifeCreationState>("WAITING");
  const [message, setMessage] = useState("");
  const stageRef = useRef<HTMLDivElement>(null);
  const timelineRef = useRef<gsap.core.Timeline | null>(null);

  const isConnecting = state === "CONNECTING";
  const isAwakening = state === "AWAKENING";

  const stageClassName = useMemo(
    () => `life-stage life-stage--${state.toLowerCase()}`,
    [state],
  );

  useEffect(() => {
    const ctx = gsap.context(() => {
      gsap.set(".life-stage__message", { autoAlpha: 0, y: 10, filter: "blur(8px)" });
      gsap.set(".soul-silhouette", { autoAlpha: 0, scale: 0.9, y: 16, filter: "blur(26px)" });
    }, stageRef);

    return () => ctx.revert();
  }, []);

  useEffect(() => {
    if (state !== "CONNECTING") return;

    timelineRef.current?.kill();
    setMessage("欢迎回来");

    const ctx = gsap.context(() => {
      timelineRef.current = gsap
        .timeline({
          defaults: { ease: "power3.inOut" },
          onComplete: () => setState("AWAKENING"),
        })
        .to(".heart-light", { scale: 1.14, duration: 0.75, filter: "brightness(1.2)" }, 0)
        .to(".presence-particle", { x: 0, y: 0, duration: 1.85, stagger: { amount: 0.45, from: "random" } }, 0.08)
        .to(".life-stage__message", { autoAlpha: 1, y: 0, filter: "blur(0px)", duration: 0.65 }, 0.35)
        .to(".life-stage__message", { autoAlpha: 0, y: -8, filter: "blur(9px)", duration: 0.55 }, 1.58);
    }, stageRef);

    return () => ctx.revert();
  }, [state]);

  useEffect(() => {
    if (state !== "AWAKENING") return;

    timelineRef.current?.kill();
    setMessage("记忆正在回应你");

    const ctx = gsap.context(() => {
      timelineRef.current = gsap
        .timeline({ defaults: { ease: "power3.inOut" } })
        .to(".heart-light__core", { scaleY: 1.65, scaleX: 0.72, duration: 1.25, transformOrigin: "50% 50%" }, 0)
        .to(".heart-light", { scale: 1.04, duration: 1.25, filter: "brightness(1.08)" }, 0)
        .to(".soul-silhouette", { autoAlpha: 1, scale: 1, y: 0, filter: "blur(13px)", duration: 1.45 }, 0.28)
        .to(".life-stage__message", { autoAlpha: 1, y: 0, filter: "blur(0px)", duration: 0.9 }, 0.75);

      gsap.to(".soul-silhouette", {
        scale: 1.025,
        duration: 3.2,
        repeat: -1,
        yoyo: true,
        ease: "sine.inOut",
      });
    }, stageRef);

    return () => ctx.revert();
  }, [state]);

  const handleStart = () => {
    if (state === "WAITING") setState("CONNECTING");
  };

  return (
    <main ref={stageRef} className={stageClassName} aria-label="忆见生命苏醒舞台">
      <PresenceSpace />
      <PresenceParticles mode={state} />

      <section className="life-stage__center" aria-live="polite">
        <SoulSilhouette active={isAwakening} />
        <HeartLight mode={state} />
        <div className="life-stage__message">{message}</div>
      </section>

      <AnimatePresence>
        {state !== "AWAKENING" && (
          <motion.div
            className="life-stage__login-wrap"
            initial={{ opacity: 0, y: 28, filter: "blur(10px)" }}
            animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
            exit={{ opacity: 0, y: 42, filter: "blur(18px)" }}
            transition={{ duration: isConnecting ? 1.2 : 0.9, ease: [0.22, 1, 0.36, 1] }}
          >
            <LightLoginPanel disabled={isConnecting} onStart={handleStart} />
          </motion.div>
        )}
      </AnimatePresence>
    </main>
  );
}
