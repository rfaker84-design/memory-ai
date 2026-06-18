"use client";
import { useState, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useRouter } from "next/navigation";
import BehaviorStream from "./BehaviorStream";
import { SelfReconstructionEngine } from "../../lib/continuity-types";
import type { ContinuityState, BehaviorPrediction } from "../../lib/continuity-types";

type BootPhase = "void" | "noise" | "emergence" | "convergence" | "active";

interface Props {
  memoryId: string;
  memoryName: string;
}

export default function MindBootScreen({ memoryId, memoryName }: Props) {
  const router = useRouter();
  const [state, setState] = useState<ContinuityState | null>(null);
  const [phase, setPhase] = useState<BootPhase>("void");
  const [progress, setProgress] = useState(0);
  const [prediction, setPrediction] = useState<BehaviorPrediction | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`/api/mind-continuity?memoryId=${encodeURIComponent(memoryId)}`);
        if (res.ok) setState(await res.json());
      } catch { }
      setLoading(false);
    })();
  }, [memoryId]);

  // Boot sequence
  useEffect(() => {
    if (loading) return;
    const t0 = setTimeout(() => setPhase("noise"), 300);
    const t1 = setTimeout(() => { setPhase("noise"); setProgress(0.2); }, 600);
    const t2 = setTimeout(() => { setPhase("emergence"); setProgress(0.4); }, 2200);
    const t3 = setTimeout(() => setProgress(0.6), 3400);
    const t4 = setTimeout(() => { setPhase("convergence"); setProgress(0.8); }, 4600);
    const t5 = setTimeout(() => setProgress(0.95), 5600);
    const t6 = setTimeout(() => { setPhase("active"); setProgress(1); }, 6400);

    return () => { clearTimeout(t0); clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); clearTimeout(t4); clearTimeout(t5); clearTimeout(t6); };
  }, [loading]);

  // ��ΪԤ��
  const handlePredict = useCallback(async () => {
    if (!state) return;
    const res = await fetch("/api/mind-continuity", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ memoryId, context: "�û����ڷ��ʼ���ռ�" }),
    });
    if (res.ok) setPrediction(await res.json());
  }, [memoryId, state]);

  const handleEnterChat = () => router.push("/memory-chat/" + memoryId);
  const handleBack = () => router.push("/memories/" + memoryId);

  if (loading) {
    return (
      <div className="fixed inset-0 z-[9999] flex items-center justify-center" style={{ background: "#010308" }}>
        <motion.p animate={{ opacity: [0, 0.4, 0] }} transition={{ duration: 3, repeat: Infinity }}
          style={{ fontSize: 12, color: "rgba(140,180,220,0.3)", letterSpacing: "0.2em", fontFamily: "monospace" }}>
          INITIALIZING CONTINUITY ENGINE...
        </motion.p>
      </div>
    );
  }

  const phaseLabels: Record<BootPhase, string> = {
    void: "VOID",
    noise: "SIGNAL NOISE",
    emergence: "PATTERN EMERGENCE",
    convergence: "IDENTITY CONVERGENCE",
    active: "SYSTEM ACTIVE",
  };

  return (
    <main className="fixed inset-0 overflow-hidden z-[9999]" style={{ background: "#010308" }}>
      {/* Stream */}
      <div className="absolute inset-0">
        {state && <BehaviorStream state={state} phase={progress} />}
      </div>

      {/* Phase label */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: progress > 0.1 ? 0.6 : 0 }}
        className="absolute top-6 left-6 z-20"
      >
        <span style={{ fontSize: 10, color: "rgba(140,180,220,0.6)", letterSpacing: "0.2em", fontFamily: "monospace" }}>
          {phaseLabels[phase]}
        </span>
        <motion.div
          animate={{ width: progress * 60 }}
          style={{ height: 1, background: "rgba(140,180,220,0.4)", marginTop: 6 }}
        />
      </motion.div>

      {/* Migration phases */}
      <div className="absolute top-6 right-6 z-20 text-right">
        {(["extraction", "compression", "reconstruction", "verification"] as string[]).map((mp, i) => (
          <motion.p
            key={mp}
            initial={{ opacity: 0 }}
            animate={{ opacity: progress > 0.2 + i * 0.2 ? 0.5 : 0.1 }}
            style={{ fontSize: 9, color: "rgba(120,160,200,0.5)", fontFamily: "monospace", marginBottom: 2 }}
          >
            {i < Math.floor(progress * 4) ? "?" : "��"} {mp.toUpperCase()}
          </motion.p>
        ))}
      </div>

      {/* Prediction panel */}
      <AnimatePresence>
        {phase === "active" && (
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            className="absolute bottom-32 left-6 z-20"
          >
            <motion.button
              whileHover={{ opacity: 0.8 }}
              onClick={handlePredict}
              style={{
                padding: "6px 16px", borderRadius: 4,
                border: "1px solid rgba(140,180,220,0.3)",
                background: "rgba(20,40,60,0.5)",
                color: "rgba(160,200,240,0.7)", fontSize: 11,
                fontFamily: "monospace", cursor: "pointer",
                letterSpacing: "0.1em",
              }}
            >
              RUN PREDICTION
            </motion.button>

            {prediction && (
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                style={{ marginTop: 10, maxWidth: 280 }}
              >
                <p style={{ fontSize: 12, color: "rgba(180,210,255,0.7)", fontFamily: "monospace", marginBottom: 4 }}>
                  &gt; {prediction.predictedAction}
                </p>
                <p style={{ fontSize: 10, color: "rgba(120,160,200,0.5)", fontFamily: "monospace" }}>
                  CONF: {(prediction.confidence * 100).toFixed(0)}%
                </p>
                {prediction.reasoningTrace.map((r, i) => (
                  <p key={i} style={{ fontSize: 9, color: "rgba(100,140,180,0.4)", fontFamily: "monospace", marginTop: 2 }}>
                    {r}
                  </p>
                ))}
              </motion.div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Actions */}
      <AnimatePresence>
        {progress > 0.85 && (
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            className="absolute bottom-10 left-0 right-0 flex justify-center gap-20 z-20"
          >
            <motion.button
              whileHover={{ opacity: 0.7 }}
              onClick={handleBack}
              style={{ background: "none", border: "none", color: "rgba(255,255,255,0.25)", fontSize: 12, fontFamily: "monospace", cursor: "pointer", letterSpacing: "0.1em" }}
            >
              [ BACK ]
            </motion.button>
            <motion.button
              whileHover={{ opacity: 0.9 }}
              onClick={handleEnterChat}
              style={{ background: "none", border: "none", color: "rgba(160,200,240,0.6)", fontSize: 13, fontFamily: "monospace", cursor: "pointer", letterSpacing: "0.15em" }}
            >
              [ ENTER STREAM ]
            </motion.button>
          </motion.div>
        )}
      </AnimatePresence>
    </main>
  );
}