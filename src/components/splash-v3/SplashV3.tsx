"use client";
import { useMemo, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useRouter } from "next/navigation";
import useAnimationTimeline from "../../lib/useAnimationTimeline";
import useLightField from "../../hooks/useLightField";
import useHaptics from "../../hooks/useHaptics";
import useNarration from "../../hooks/useNarration";
import StarField from "./StarField";
import DoorPortal from "./DoorPortal";
import MemoryText from "./MemoryText";
import SkipButton from "./SkipButton";

const TOTAL = 7200;
const STAGES = [
  { name: "cosmos", start: 0, end: 1500 },
  { name: "doorBuild", start: 1100, end: 3200 },
  { name: "doorBreath", start: 2800, end: 5200 },
  { name: "bloom", start: 4800, end: 6200 },
  { name: "fade", start: 6000, end: 7200 },
];

function sr(s: number) { let v = s; return () => { v = (v * 16807) % 2147483647; return v / 2147483647; }; }

export default function SplashV3() {
  const router = useRouter();
  const tl = useAnimationTimeline(STAGES, TOTAL);
  const lf = useLightField();
  const h = useHaptics();
  const triggered = useRef({ door: false, bloom: false, enter: false });
  useNarration("��Щ����Ȼ�뿪�ˣ���������Ȼ��������ڡ�");

  // Haptics triggers
  const ds = tl.getStage("doorBuild");
  const bs = tl.getStage("bloom");
  if (ds && ds.progress > 0.1 && !triggered.current.door) { h.onDoor(); triggered.current.door = true; }
  if (bs && bs.progress > 0.1 && !triggered.current.bloom) { h.onBloom(); triggered.current.bloom = true; }

  // Navigation on complete or skip
  const skip = () => { if (triggered.current.enter) return; h.onEnter(); triggered.current.enter = true; router.replace("/memories"); };
  if (tl.done) { if (!triggered.current.enter) { h.onEnter(); triggered.current.enter = true; } router.replace("/memories"); return null; }

  const cp = (tl.getStage("cosmos")?.progress) ?? 0;
  const dbp = (tl.getStage("doorBuild")?.progress) ?? 0;
  const drp = (tl.getStage("doorBreath")?.progress) ?? 0;
  const blp = (tl.getStage("bloom")?.progress) ?? 0;
  const fap = (tl.getStage("fade")?.progress) ?? 0;
  const breathe = Math.sin(drp * Math.PI * 2.5) * 0.5 + 0.5;

  const dbs = tl.getStage("doorBuild");
  const drs = tl.getStage("doorBreath");
  const bls = tl.getStage("bloom");
  const fs = tl.getStage("fade");

  const particles = useMemo(() => Array.from({ length: 35 }, (_, i) => ({ seed: i })), []);

  return (
    <main className="fixed inset-0 overflow-hidden" style={{ background: "#020208", zIndex: 9999 }}>
      

      {/* Deep space */}
      <div className="absolute inset-0 pointer-events-none">
        <div style={{ position: "absolute", inset: 0, background: "radial-gradient(ellipse at 50% 38%, #0C0B1E 0%, #060612 40%, #020208 80%, #010106 100%)" }}/>
        <div style={{ position: "absolute", top: "-2%", left: "-8%", width: "55%", height: "35%", background: "radial-gradient(ellipse at 30% 25%, rgba(18,16,60,0.4), transparent 55%)", filter: "blur(55px)", animation: "nd 13s ease-in-out infinite" }}/>
        <div style={{ position: "absolute", bottom: "5%", right: "-3%", width: "50%", height: "30%", background: "radial-gradient(ellipse at 65% 50%, rgba(14,11,45,0.3), transparent 55%)", filter: "blur(50px)", animation: "nd 16s ease-in-out infinite 4s" }}/>
      </div>

      <StarField progress={cp} />

      <DoorPortal dbp={dbp} drp={drp} breathe={breathe} lightIntensity={lf.intensity} active={dbs?.active ?? false} done={dbs?.done ?? false} fade={fs?.active ?? false} />

      <MemoryText />

      {/* Bloom */}
      <AnimatePresence>
        {(bls?.active) && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: Math.min(blp * 1.5, 1) * (0.8 + lf.intensity * 0.2) }} className="absolute inset-0 pointer-events-none">
            <div style={{ position: "absolute", inset: 0, background: "radial-gradient(ellipse at 50% 38%, rgba(255,210,140," + (0.15 + blp * 0.35) + ") 0%, transparent 65%)" }}/>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Fade to white */}
      <AnimatePresence>
        {(fs?.active) && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: Math.min(fap * 1.3, 1) }} className="absolute inset-0 pointer-events-none" style={{ background: "radial-gradient(ellipse at 50% 38%, rgba(255,245,225,0.95) 0%, #ffffff 55%)" }}/>
        )}
      </AnimatePresence>

      {/* Ground light + particles */}
      <motion.div initial={{ opacity: 0, scaleX: 0.2 }} animate={{ opacity: (drs?.active || drs?.done) ? 0.35 * lf.intensity : 0, scaleX: (drs?.active || drs?.done) ? 1.3 : 0.2 }} style={{ position: "absolute", bottom: "10%", left: "50%", transform: "translateX(-50%)", width: 200, height: 60, borderRadius: "50%", background: "radial-gradient(ellipse at center, rgba(255,200,120,0.3), transparent 70%)", filter: "blur(18px)" }}/>

      {((drs?.active || drs?.done) && !(fs?.active)) && (
        <div className="absolute inset-0 pointer-events-none overflow-hidden">
          {particles.map((p) => {
            const r = sr(p.seed * 333);
            return <div key={"p"+p.seed} style={{ position: "absolute", left: (38 + r() * 24) + "%", top: (30 + r() * 40) + "%", width: (1 + r() * 2.5) + "px", height: (1 + r() * 2.5) + "px", borderRadius: "50%", background: "rgba(255,210,130," + (0.3 + r() * 0.5) + ")", boxShadow: "0 0 " + (2 + r() * 3) + "px rgba(255,190,100,0.5)", animation: "pf " + (3 + r() * 4) + "s ease-out infinite " + r() * 2 + "s", opacity: lf.intensity * 0.9 + 0.1 }} />;
          })}
        </div>
      )}

      <SkipButton onSkip={skip} visible={tl.elapsed > 1000} />
    </main>
  );
}

