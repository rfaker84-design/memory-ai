"use client";
import { useState, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useRouter } from "next/navigation";
import useMemoryCamera, { CAMERA_PRESETS } from "../../hooks/useMemoryCamera";
import useLightField from "../../hooks/useLightField";
import useHaptics from "../../hooks/useHaptics";
import WorldAtmosphere from "./WorldAtmosphere";
import SceneRenderer from "./SceneRenderer";
import InteractiveEntry from "./InteractiveEntry";
import type { WorldConfig, WorldScene } from "../../lib/world-types";

interface Props {
  world: WorldConfig;
  memoryId: string;
  memoryName: string;
}

type Phase = "intro" | "scenes" | "outro";

export default function MemoryWorldRenderer({ world, memoryId, memoryName }: Props) {
  const router = useRouter();
  const cam = useMemoryCamera();
  const lf = useLightField();
  const h = useHaptics();

  const [phase, setPhase] = useState<Phase>("intro");
  const [currentSceneIdx, setCurrentSceneIdx] = useState(-1);
  const [showUI, setShowUI] = useState(false);
  const [intensity, setIntensity] = useState(0);
  const [ready, setReady] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const enteredRef = useRef(false);

  const scenes = world.scenes || [];
  const weather = world.atmosphere?.weather || "warm_light";
  const timeOfDay = world.atmosphere?.time || "memory_time";
  const worldType = world.world_type || "dream";

  // Intro: camera pull-back + atmosphere fade in
  useEffect(() => {
    cam.moveTo({ zoom: 1.2, blur: 2, brightness: 0.5 }, 0); // instant start
    const t1 = setTimeout(() => {
      cam.moveTo({ zoom: 1.0, blur: 0, brightness: 1.0 }, 2500);
      setIntensity(0.6);
    }, 300);
    const t2 = setTimeout(() => {
      setReady(true);
      setIntensity(1);
    }, 1800);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, []);

  // Start scene sequence when ready
  useEffect(() => {
    if (!ready || phase !== "intro") return;
    setPhase("scenes");
    advanceScene(0);
  }, [ready]);

  const advanceScene = useCallback((idx: number) => {
    if (idx >= scenes.length) {
      // All scenes done
      setPhase("outro");
      setShowUI(true);
      return;
    }

    setCurrentSceneIdx(idx);
    const scene = scenes[idx];

    // Camera movement based on scene emotion
    if (scene.emotion === "warm") cam.moveTo(CAMERA_PRESETS.dollyRight, 1500);
    else if (scene.emotion === "sad") cam.moveTo(CAMERA_PRESETS.memoryFocus, 2000);
    else if (scene.emotion === "nostalgic") cam.moveTo(CAMERA_PRESETS.dreamBlur, 1800);
    else cam.moveTo(CAMERA_PRESETS.wideShot, 1500);

    // Haptic
    if (idx === 0) h.onDoor();
    if (idx === scenes.length - 1) h.onBloom();

    // Auto-advance
    const duration = (scene.duration || 2.5) * 1000;
    timerRef.current = setTimeout(() => {
      advanceScene(idx + 1);
    }, duration);
  }, [scenes, cam, h]);

  // Show UI on last scene
  useEffect(() => {
    if (phase === "scenes" && currentSceneIdx === scenes.length - 1) {
      const t = setTimeout(() => setShowUI(true), 800);
      return () => clearTimeout(t);
    }
  }, [phase, currentSceneIdx, scenes.length]);

  // Cleanup timers
  useEffect(() => {
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, []);

  const handleEnter = () => {
    if (enteredRef.current) return;
    enteredRef.current = true;
    h.onEnter();
    router.push("/memory-chat/" + memoryId);
  };

  const handleSkip = () => {
    if (enteredRef.current) return;
    enteredRef.current = true;
    h.onEnter();
    router.push("/memories/" + memoryId);
  };

  const currentScene: WorldScene | null =
    currentSceneIdx >= 0 && currentSceneIdx < scenes.length ? scenes[currentSceneIdx] : null;

  const camStyle: React.CSSProperties = {
    transform: `
      scale(${cam.camera.zoom})
      translate(${cam.camera.x}px, ${cam.camera.y}px)
      rotateX(${cam.camera.rotateX}deg)
      rotateY(${cam.camera.rotateY}deg)
    `,
    filter: `blur(${cam.camera.blur}px) brightness(${cam.camera.brightness})`,
    transition: "none", // RAF-driven, no CSS transition needed
  };

  return (
    <main className="fixed inset-0 overflow-hidden" style={{ background: "#000", zIndex: 9999 }}>
      {/* Camera container */}
      <div className="absolute inset-0" style={camStyle}>
        <WorldAtmosphere
          weather={weather}
          timeOfDay={timeOfDay}
          worldType={worldType}
          intensity={intensity * (0.6 + lf.intensity * 0.4)}
          active={true}
        />

        {/* Scene overlay */}
        {currentScene && (
          <SceneRenderer
            scene={currentScene}
            active={phase === "scenes"}
            weather={weather}
            globalIntensity={intensity * (0.5 + lf.intensity * 0.5)}
          />
        )}

        {/* Outro: final scene shows "进入记忆" */}
        <AnimatePresence>
          {phase === "outro" && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none"
            >
              <motion.h2
                initial={{ opacity: 0, y: 16, filter: "blur(6px)" }}
                animate={{ opacity: 0.7, y: 0, filter: "blur(0px)" }}
                transition={{ duration: 1.2 }}
                style={{
                  fontSize: 22,
                  fontWeight: 300,
                  color: "rgba(255,255,255,0.7)",
                  letterSpacing: "0.2em",
                  marginBottom: 12,
                }}
              >
                {memoryName}
              </motion.h2>
              <motion.p
                initial={{ opacity: 0 }}
                animate={{ opacity: 0.4 }}
                transition={{ duration: 1, delay: 0.5 }}
                style={{
                  fontSize: 14,
                  color: "rgba(255,255,255,0.4)",
                  letterSpacing: "0.1em",
                }}
              >
                TA 在这里，一直在。
              </motion.p>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Interactive UI layer */}
      <InteractiveEntry
        visible={showUI}
        weather={weather}
        onEnter={handleEnter}
        onSkip={handleSkip}
        canEnter={phase === "outro"}
        currentScene={Math.min(currentSceneIdx + 1, scenes.length)}
        totalScenes={scenes.length}
      />

      {/* Loading indicator */}
      <AnimatePresence>
        {!ready && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 flex items-center justify-center"
          >
            <motion.p
              animate={{ opacity: [0.2, 0.5, 0.2] }}
              transition={{ duration: 2.5, repeat: Infinity }}
              style={{
                fontSize: 14,
                color: "rgba(255,255,255,0.25)",
                letterSpacing: "0.15em",
              }}
            >
              正在构建记忆世界...
            </motion.p>
          </motion.div>
        )}
      </AnimatePresence>
    </main>
  );
}