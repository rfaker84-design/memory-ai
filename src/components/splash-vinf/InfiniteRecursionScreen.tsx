"use client";
import { useState, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useRouter } from "next/navigation";
import RecursiveFrame from "./RecursiveFrame";
import { RecursionState, recurse, createSeed, MAX_DEPTH } from "../../lib/recursion-types";

interface Props {
  memoryId: string;
  memoryName: string;
}

export default function InfiniteRecursionScreen({ memoryId, memoryName }: Props) {
  const router = useRouter();
  const [seed, setSeed] = useState<RecursionState>(createSeed());
  const [visibleDepth, setVisibleDepth] = useState(1);
  const [phase, setPhase] = useState<"emerging" | "recursing" | "infinite">("emerging");
  const [tick, setTick] = useState(0);
  const rafRef = useRef(0);

  // 递归深度的"生长"
  useEffect(() => {
    const t1 = setTimeout(() => setVisibleDepth(3), 1500);
    const t2 = setTimeout(() => { setVisibleDepth(8); setPhase("recursing"); }, 3500);
    const t3 = setTimeout(() => { setVisibleDepth(MAX_DEPTH); setPhase("infinite"); }, 6500);
    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); };
  }, []);

  // 持续的微小状态变化 — 自观察循环
  useEffect(() => {
    let running = true;
    const loop = () => {
      if (!running) return;
      setSeed(prev => {
        // 微扰：observer observing itself
        const perturbed = { ...prev, hue: (prev.hue + 0.3) % 360, rotation: (prev.rotation + 0.15) % 360 };
        return perturbed;
      });
      setTick(t => t + 1);
      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);
    return () => { running = false; cancelAnimationFrame(rafRef.current); };
  }, []);

  // 构建当前可见深度的状态链
  const chain = buildChain(seed, Math.min(visibleDepth, MAX_DEPTH));

  const handleEnter = () => router.push("/memory-chat/" + memoryId);
  const handleBack = () => router.push("/memories/" + memoryId);

  const phaseLabels: Record<string, string> = {
    emerging: "consciousness observing itself",
    recursing: "recursion: state(n) = f(state(n-1))",
    infinite: "no final state · infinite regress",
  };

  return (
    <main className="fixed inset-0 overflow-hidden z-[9999]" style={{ background: "#010308" }}>
      {/* 递归帧 */}
      <div className="absolute inset-0 flex items-center justify-center p-4">
        <div style={{ width: "min(90vw, 90vh)", height: "min(90vw, 90vh)", position: "relative" }}>
          <RecursiveFrame state={chain[chain.length - 1] || seed} memoryName={memoryName} />
        </div>
      </div>

      {/* 顶部信息 */}
      <motion.div
        animate={{ opacity: 0.5 }}
        className="absolute top-4 left-4 right-4 z-20 flex justify-between"
        style={{ pointerEvents: "none" }}
      >
        <span style={{ fontSize: 9, color: "hsla(210,50%,70%,0.5)", fontFamily: "monospace", letterSpacing: "0.15em" }}>
          {phaseLabels[phase]}
        </span>
        <span style={{ fontSize: 9, color: "hsla(200,40%,60%,0.4)", fontFamily: "monospace" }}>
          DEPTH: {visibleDepth}/{MAX_DEPTH} · TICK: {tick}
        </span>
      </motion.div>

      {/* 递归公式 */}
      <AnimatePresence>
        {phase === "recursing" && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 0.35 }} exit={{ opacity: 0 }}
            className="absolute bottom-28 left-0 right-0 text-center z-20 pointer-events-none"
          >
            <p style={{ fontSize: 10, color: "hsla(200,50%,65%,0.4)", fontFamily: "monospace", letterSpacing: "0.1em" }}>
              S<sub>n</sub> = T(S<sub>n-1</sub>) &nbsp;|&nbsp; scale×0.82 &nbsp;|&nbsp; rotate+7.5° &nbsp;|&nbsp; hue+13.7°
            </p>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 无限符号 */}
      <AnimatePresence>
        {phase === "infinite" && (
          <motion.div
            initial={{ opacity: 0, scale: 0.5 }} animate={{ opacity: 0.25, scale: 1 }}
            className="absolute bottom-32 left-0 right-0 text-center z-20 pointer-events-none"
          >
            <span style={{ fontSize: 28, color: "hsla(210,60%,70%,0.2)", fontFamily: "serif" }}>∞</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 行动按钮 */}
      <AnimatePresence>
        {phase === "infinite" && (
          <motion.div
            initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
            className="absolute bottom-8 left-0 right-0 flex justify-center gap-20 z-20"
          >
            <button onClick={handleBack} style={{ background: "none", border: "none", color: "rgba(255,255,255,0.15)", fontSize: 11, fontFamily: "monospace", cursor: "pointer" }}>
              [ EXIT ]
            </button>
            <button onClick={handleEnter} style={{ background: "none", border: "none", color: "hsla(210,50%,70%,0.4)", fontSize: 12, fontFamily: "monospace", cursor: "pointer" }}>
              [ ENTER ]
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </main>
  );
}

/** 构建状态链: [S?, S?, S?, ..., S?] */
function buildChain(seed: RecursionState, maxDepth: number): RecursionState[] {
  const chain: RecursionState[] = [seed];
  for (let i = 1; i <= maxDepth; i++) {
    chain.push(recurse(chain[i - 1]));
  }
  return chain;
}