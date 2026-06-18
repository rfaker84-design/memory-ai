"use client";
import { useMemo, useRef, useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useRouter } from "next/navigation";
import useAnimationTimeline from "../../lib/useAnimationTimeline";
import useLightField from "../../hooks/useLightField";
import useHaptics from "../../hooks/useHaptics";
import EmotionStarField from "./EmotionStarField";
import EmotionDoorPortal from "./EmotionDoorPortal";
import SymbolParticles from "./SymbolParticles";
import SkipButton from "../splash-v3/SkipButton";
import type { SceneConfig, EmotionType } from "../../lib/scene-types";
import { EMOTION_PALETTES, EMOTION_BREATH } from "../../lib/scene-types";

function sr(s: number) {
  let v = s;
  return () => { v = (v * 16807) % 2147483647; return v / 2147483647; };
}

const TOTAL = 7200;
const STAGES = [
  { name: "cosmos", start: 0, end: 1500 },
  { name: "doorBuild", start: 1100, end: 3200 },
  { name: "doorBreath", start: 2800, end: 5200 },
  { name: "bloom", start: 4800, end: 6200 },
  { name: "fade", start: 6000, end: 7200 },
];

interface Props {
  memoryId: string;
  onComplete?: () => void;
}

export default function SplashScreenV4({ memoryId, onComplete }: Props) {
  const router = useRouter();
  const [config, setConfig] = useState<SceneConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const tl = useAnimationTimeline(STAGES, TOTAL);
  const lf = useLightField();
  const h = useHaptics();
  const triggered = useRef({ door: false, bloom: false, enter: false });

  // Fetch scene config
  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch("/api/scene-config", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ memoryId }),
        });
        if (res.ok && !cancelled) {
          const data = await res.json();
          setConfig(data);
        }
      } catch {
        // Use defaults
        if (!cancelled) {
          setConfig({
            emotion: "warm",
            colorPalette: ["#FFD58A", "#FFB86C", "#FF9F4B", "#F0C27A", "#E8B870"],
            intensity: 0.6,
            memorySymbols: ["��ů�Ĺ�â", "δ˵��Ļ�", "Զ�����ǳ�"],
            narration: "��Щ���䲻����ʧ��ֻ�ǻ���һ�ִ��ڷ�ʽ��",
          });
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [memoryId]);

  const emotion: EmotionType = (config?.emotion as EmotionType) || "warm";
  const palette = EMOTION_PALETTES[emotion];
  const breath = EMOTION_BREATH[emotion];

  // Haptics
  const ds = tl.getStage("doorBuild");
  const bs = tl.getStage("bloom");
  if (ds && ds.progress > 0.1 && !triggered.current.door) { h.onDoor(); triggered.current.door = true; }
  if (bs && bs.progress > 0.1 && !triggered.current.bloom) { h.onBloom(); triggered.current.bloom = true; }

  // Navigation
  const skip = () => {
    if (triggered.current.enter) return;
    h.onEnter();
    triggered.current.enter = true;
    if (onComplete) onComplete();
    else router.replace("/memories/" + memoryId);
  };

  if (!loading && tl.done) {
    if (!triggered.current.enter) {
      h.onEnter();
      triggered.current.enter = true;
    }
    if (onComplete) { onComplete(); return null; }
    router.replace("/memories/" + memoryId);
    return null;
  }

  const cp = (tl.getStage("cosmos")?.progress) ?? 0;
  const dbp = (tl.getStage("doorBuild")?.progress) ?? 0;
  const drp = (tl.getStage("doorBreath")?.progress) ?? 0;
  const blp = (tl.getStage("bloom")?.progress) ?? 0;
  const fap = (tl.getStage("fade")?.progress) ?? 0;
  const breathe = Math.sin(drp * Math.PI * breath.frequency) * breath.amplitude + (1 - breath.amplitude);

  const dbs = tl.getStage("doorBuild");
  const drs = tl.getStage("doorBreath");
  const bls = tl.getStage("bloom");
  const fs = tl.getStage("fade");

  const sceneIntensity = config?.intensity ?? 0.6;

  const particles = useMemo(
    () => Array.from({ length: 35 }, (_, i) => ({ seed: i })),
    []
  );

  return (
    <main className="fixed inset-0 overflow-hidden" style={{ background: palette.bg, zIndex: 9999 }}>
      {/* Deep space bg */}
      <div className="absolute inset-0 pointer-events-none">
        <div
          style={{
            position: "absolute",
            inset: 0,
            background:
              "radial-gradient(ellipse at 50% 38%, " + palette.bg + " 0%, #060612 40%, #020208 80%, #010106 100%)",
          }}
        />
        <div
          style={{
            position: "absolute",
            top: "-2%",
            left: "-8%",
            width: "55%",
            height: "35%",
            background:
              "radial-gradient(ellipse at 30% 25%, " + palette.glow + "0.15), transparent 55%)",
            filter: "blur(55px)",
            animation: "nd 13s ease-in-out infinite",
          }}
        />
        <div
          style={{
            position: "absolute",
            bottom: "5%",
            right: "-3%",
            width: "50%",
            height: "30%",
            background:
              "radial-gradient(ellipse at 65% 50%, " + palette.glow + "0.08), transparent 55%)",
            filter: "blur(50px)",
            animation: "nd 16s ease-in-out infinite 4s",
          }}
        />
      </div>

      {/* Loading state */}
      {loading && (
        <div className="absolute inset-0 flex items-center justify-center">
          <motion.div
            animate={{ opacity: [0.3, 0.7, 0.3] }}
            transition={{ duration: 2, repeat: Infinity }}
            style={{
              fontSize: 14,
              color: "rgba(255,255,255,0.3)",
              letterSpacing: "0.15em",
            }}
          >
            ����׼����ļ���ռ�...
          </motion.div>
        </div>
      )}

      {!loading && config && (
        <>
          <EmotionStarField emotion={emotion} progress={cp} intensity={sceneIntensity} />

          <EmotionDoorPortal
            emotion={emotion}
            dbp={dbp}
            drp={drp}
            breathe={breathe}
            lightIntensity={lf.intensity}
            active={dbs?.active ?? false}
            done={dbs?.done ?? false}
            fade={fs?.active ?? false}
            sceneIntensity={sceneIntensity}
          />

          <SymbolParticles
            symbols={config.memorySymbols || []}
            emotion={emotion}
            active={(drs?.active || drs?.done) ?? false}
            fadeOut={fs?.active ?? false}
            intensity={(0.5 + lf.intensity * 0.5) * sceneIntensity}
          />

          {/* AI Narration text */}
          <AnimatePresence>
            {(drs?.active) && config.narration && (
              <motion.div
                initial={{ opacity: 0, filter: "blur(8px)", y: 8 }}
                animate={{ opacity: 0.6, filter: "blur(0px)", y: 0 }}
                exit={{ opacity: 0, filter: "blur(8px)", y: -4 }}
                transition={{ duration: 1.2, ease: "easeOut" }}
                className="absolute bottom-20 left-0 right-0 text-center pointer-events-none z-20"
              >
                <p
                  style={{
                    fontSize: 15,
                    fontWeight: 300,
                    color: "rgba(255,235,200,0.65)",
                    letterSpacing: "0.1em",
                    textShadow: "0 0 20px " + palette.accent + "33",
                    padding: "0 48px",
                    lineHeight: 1.8,
                  }}
                >
                  {config.narration}
                </p>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Bloom overlay */}
          <AnimatePresence>
            {bls?.active && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: Math.min(blp * 1.5, 1) * (0.8 + lf.intensity * 0.2) }}
                className="absolute inset-0 pointer-events-none"
              >
                <div
                  style={{
                    position: "absolute",
                    inset: 0,
                    background:
                      "radial-gradient(ellipse at 50% 38%, " +
                      palette.glow +
                      (0.15 + blp * 0.35) +
                      ") 0%, transparent 65%)",
                  }}
                />
              </motion.div>
            )}
          </AnimatePresence>

          {/* Fade to white */}
          <AnimatePresence>
            {fs?.active && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: Math.min(fap * 1.3, 1) }}
                className="absolute inset-0 pointer-events-none"
                style={{
                  background:
                    "radial-gradient(ellipse at 50% 38%, " + palette.accent + "33 0%, #ffffff 55%)",
                }}
              />
            )}
          </AnimatePresence>

          {/* Ground light */}
          <motion.div
            initial={{ opacity: 0, scaleX: 0.2 }}
            animate={{
              opacity: drs?.active || drs?.done ? 0.3 * lf.intensity * sceneIntensity : 0,
              scaleX: drs?.active || drs?.done ? 1.3 : 0.2,
            }}
            style={{
              position: "absolute",
              bottom: "10%",
              left: "50%",
              transform: "translateX(-50%)",
              width: 200,
              height: 60,
              borderRadius: "50%",
              background:
                "radial-gradient(ellipse at center, " + palette.glow + "0.25), transparent 70%)",
              filter: "blur(18px)",
            }}
          />

          {/* Light particles */}
          {(drs?.active || drs?.done) && !fs?.active && (
            <div className="absolute inset-0 pointer-events-none overflow-hidden">
              {particles.map((p) => {
                const r = sr(p.seed * 333);
                return (
                  <div
                    key={"p" + p.seed}
                    style={{
                      position: "absolute",
                      left: (38 + r() * 24) + "%",
                      top: (30 + r() * 40) + "%",
                      width: (1 + r() * 2.5) + "px",
                      height: (1 + r() * 2.5) + "px",
                      borderRadius: "50%",
                      background: palette.door + (0.3 + r() * 0.5) + ")",
                      boxShadow: "0 0 " + (2 + r() * 3) + "px " + palette.glow + "0.5)",
                      animation:
                        "pf " + (3 + r() * 4) + "s ease-out infinite " + r() * 2 + "s",
                      opacity: lf.intensity * 0.9 + 0.1,
                    }}
                  />
                );
              })}
            </div>
          )}
        </>
      )}

      {!loading && <SkipButton onSkip={skip} visible={tl.elapsed > 1000} />}
    </main>
  );
}