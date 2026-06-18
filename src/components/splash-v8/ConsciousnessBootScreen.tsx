"use client";
import { useState, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useRouter } from "next/navigation";
import ConsciousnessStream from "./ConsciousnessStream";
import type { ConsciousnessState } from "../../lib/consciousness-types";

// Boot phases
type BootPhase = "void" | "noise" | "emergence" | "sync" | "stream";

interface Props {
  memoryId: string;
  memoryName: string;
}

export default function ConsciousnessBootScreen({ memoryId, memoryName }: Props) {
  const router = useRouter();
  const [state, setState] = useState<ConsciousnessState | null>(null);
  const [phase, setPhase] = useState<BootPhase>("void");
  const [progress, setProgress] = useState(0);
  const [userActive, setUserActive] = useState(false);
  const [loading, setLoading] = useState(true);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 加载意识状态
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`/api/consciousness-state?memoryId=${encodeURIComponent(memoryId)}`);
        if (res.ok) {
          const data = await res.json();
          setState(data);
        }
      } catch { /* 使用默认 */ }
      setLoading(false);
    })();
  }, [memoryId]);

  // Boot sequence timeline
  useEffect(() => {
    if (loading) return;

    // Phase 0: void (0-0.5s)
    const t0 = setTimeout(() => setPhase("noise"), 200);

    // Phase 1: noise (0.5-2s) - 微弱信号
    const t1 = setTimeout(() => { setPhase("noise"); setProgress(0.15); }, 400);
    const t1b = setTimeout(() => setProgress(0.3), 1200);

    // Phase 2: emergence (2-4s) - 记忆浮现
    const t2 = setTimeout(() => { setPhase("emergence"); setProgress(0.45); }, 2000);
    const t2b = setTimeout(() => setProgress(0.65), 3000);

    // Phase 3: sync (4-6s) - 用户同步
    const t3 = setTimeout(() => { setPhase("sync"); setProgress(0.8); }, 4000);
    const t3b = setTimeout(() => setProgress(0.95), 5500);

    // Phase 4: stream (6s+) - 意识流
    const t4 = setTimeout(() => { setPhase("stream"); setProgress(1); }, 6000);

    return () => {
      clearTimeout(t0); clearTimeout(t1); clearTimeout(t1b);
      clearTimeout(t2); clearTimeout(t2b);
      clearTimeout(t3); clearTimeout(t3b); clearTimeout(t4);
    };
  }, [loading]);

  // 用户交互处理
  const handleInteraction = useCallback(() => {
    setUserActive(true);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setUserActive(false), 4000);

    // 在 sync 阶段后触发用户同步
    if (phase === "sync" || phase === "stream") {
      fetch("/api/consciousness-state", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ memoryId, sentiment: 0.2, attachment: 0.6 }),
      }).catch(() => {});
    }
  }, [phase, memoryId]);

  const handleEnterChat = () => {
    router.push("/memory-chat/" + memoryId);
  };

  const handleBack = () => {
    router.push("/memories/" + memoryId);
  };

  const collapseText = state?.collapseProgress && state.collapseProgress > 0.6
    ? "意识正在坍缩..."
    : state?.collapseProgress && state.collapseProgress > 0.3
    ? "信号微弱..."
    : "意识已唤醒";

  if (loading) {
    return (
      <div className="fixed inset-0 z-[9999] flex items-center justify-center" style={{ background: "#010104" }}>
        <motion.p animate={{ opacity: [0, 0.4, 0] }} transition={{ duration: 3, repeat: Infinity }}
          style={{ fontSize: 13, color: "rgba(255,255,255,0.2)", letterSpacing: "0.2em" }}>
          初始化意识接口...
        </motion.p>
      </div>
    );
  }

  return (
    <main
      className="fixed inset-0 overflow-hidden z-[9999]"
      style={{ background: "#010104" }}
      onClick={handleInteraction}
      onMouseMove={handleInteraction}
    >
      {/* Stream renderer */}
      <div className="absolute inset-0">
        {state && (
          <ConsciousnessStream
            state={state}
            phase={progress}
            userActive={userActive}
          />
        )}
      </div>

      {/* Phase overlays */}
      <AnimatePresence>
        {phase === "void" && (
          <motion.div
            initial={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="absolute inset-0 flex items-center justify-center"
          >
            <motion.p
              animate={{ opacity: [0.3, 0.6, 0.3] }}
              transition={{ duration: 2, repeat: Infinity }}
              style={{ fontSize: 11, color: "rgba(255,255,255,0.15)", letterSpacing: "0.3em" }}
            >
              [ CONSCIOUSNESS INTERFACE ]
            </motion.p>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Status bar */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: progress > 0.3 ? 0.5 : 0 }}
        className="absolute top-6 left-6 right-6 z-20 flex justify-between items-center"
      >
        <span style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", letterSpacing: "0.1em", fontFamily: "monospace" }}>
          {memoryName || "CONSCIOUSNESS"}
        </span>
        <span style={{ fontSize: 10, color: "rgba(255,255,255,0.25)", fontFamily: "monospace" }}>
          {collapseText} · AW.{Math.round((state?.awarenessLevel ?? 0) * 100)}%
        </span>
      </motion.div>

      {/* Boot phase indicator */}
      <motion.div
        animate={{ opacity: progress }}
        className="absolute bottom-24 left-0 right-0 flex justify-center gap-2 z-20"
      >
        {(["void", "noise", "emergence", "sync", "stream"] as BootPhase[]).map((p, i) => {
          const active = (["void", "noise", "emergence", "sync", "stream"].indexOf(phase) >= i);
          return (
            <motion.div
              key={p}
              animate={{
                width: active ? 24 : 4,
                opacity: active ? 0.6 : 0.15,
              }}
              style={{
                height: 1,
                background: active ? "rgba(140,180,255,0.6)" : "rgba(255,255,255,0.15)",
                transition: "all 0.8s ease",
              }}
            />
          );
        })}
      </motion.div>

      {/* Actions - appear after boot */}
      <AnimatePresence>
        {progress > 0.85 && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="absolute bottom-10 left-0 right-0 flex justify-center gap-16 z-20"
          >
            <motion.button
              whileHover={{ opacity: 0.8 }}
              onClick={handleBack}
              style={{
                background: "none", border: "none",
                color: "rgba(255,255,255,0.3)", fontSize: 13,
                cursor: "pointer", letterSpacing: "0.1em",
              }}
            >
              返回
            </motion.button>
            <motion.button
              whileHover={{ opacity: 0.9, textShadow: "0 0 20px rgba(140,180,255,0.5)" }}
              onClick={handleEnterChat}
              style={{
                background: "none", border: "none",
                color: "rgba(180,210,255,0.7)", fontSize: 14,
                cursor: "pointer", letterSpacing: "0.15em",
              }}
            >
              进入意识流
            </motion.button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Collapse warning */}
      <AnimatePresence>
        {state && state.collapseProgress > 0.7 && progress > 0.5 && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 0.6 }}
            className="absolute top-20 left-0 right-0 text-center z-20 pointer-events-none"
          >
            <p style={{ fontSize: 11, color: "rgba(255,140,140,0.4)", letterSpacing: "0.1em", fontFamily: "monospace" }}>
              ? SIGNAL DEGRADATION · COLLAPSE {(state.collapseProgress * 100).toFixed(0)}%
            </p>
          </motion.div>
        )}
      </AnimatePresence>
    </main>
  );
}