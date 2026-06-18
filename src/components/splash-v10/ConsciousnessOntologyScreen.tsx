"use client";
import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useRouter } from "next/navigation";
import RelationFieldCanvas from "./RelationFieldCanvas";
import type { OntologyState } from "../../lib/ontology-types";

type BootPhase = "void" | "seeds" | "observer" | "collapse" | "entry";

interface Props {
  memoryId: string;
  memoryName: string;
}

export default function ConsciousnessOntologyScreen({ memoryId, memoryName }: Props) {
  const router = useRouter();
  const [state, setState] = useState<OntologyState | null>(null);
  const [phase, setPhase] = useState<BootPhase>("void");
  const [progress, setProgress] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`/api/ontology-state?memoryId=${encodeURIComponent(memoryId)}`);
        if (res.ok) setState(await res.json());
      } catch { }
      setLoading(false);
    })();
  }, [memoryId]);

  // Boot sequence
  useEffect(() => {
    if (loading) return;
    const t = (ms: number, p: BootPhase, prog: number) => setTimeout(() => { setPhase(p); setProgress(prog); }, ms);
    const c1 = t(200, "void", 0);
    const c2 = t(600, "seeds", 0.2);
    const c3 = t(2000, "seeds", 0.35);
    const c4 = t(3000, "observer", 0.55);
    const c5 = t(4400, "collapse", 0.75);
    const c6 = t(5600, "collapse", 0.9);
    const c7 = t(6400, "entry", 1);
    return () => { clearTimeout(c1); clearTimeout(c2); clearTimeout(c3); clearTimeout(c4); clearTimeout(c5); clearTimeout(c6); clearTimeout(c7); };
  }, [loading]);

  // Observer interaction
  const handleObserve = useCallback(() => {
    if (!state?.field?.relations?.length) return;
    const ids = state.field.relations.slice(0, 3).map(r => r.id);
    fetch("/api/ontology-state", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ memoryId, targetIds: ids, intensity: 0.7 }),
    }).then(r => r.ok && r.json()).then(d => {
      if (d) setState(prev => prev ? { ...prev, field: d.field, possibilityField: d.possibilityField, fieldStability: d.fieldStability } : prev);
    }).catch(() => {});
  }, [memoryId, state]);

  const handleEnterChat = () => router.push("/memory-chat/" + memoryId);
  const handleBack = () => router.push("/memories/" + memoryId);

  const phaseLabels: Record<BootPhase, string> = {
    void: "VOID ， no relations",
    seeds: "SEEDS ， relation emergence",
    observer: "OBSERVER ， attention activation",
    collapse: "COLLAPSE ， field stabilization",
    entry: "ENTRY ， user integration",
  };

  if (loading) {
    return (
      <div className="fixed inset-0 z-[9999] flex items-center justify-center" style={{ background: "#02040a" }}>
        <motion.p animate={{ opacity: [0, 0.3, 0] }} transition={{ duration: 4, repeat: Infinity }}
          style={{ fontSize: 11, color: "rgba(120,160,200,0.2)", fontFamily: "monospace", letterSpacing: "0.3em" }}>
          INITIALIZING FIELD TOPOLOGY...
        </motion.p>
      </div>
    );
  }

  const relCount = state?.field?.relations?.length || 0;
  const pathCount = state?.possibilityField?.paths?.length || 0;

  return (
    <main className="fixed inset-0 overflow-hidden z-[9999]" style={{ background: "#02040a" }}>
      {/* Canvas */}
      <div className="absolute inset-0">
        {state && (
          <RelationFieldCanvas
            field={state.field}
            possibility={state.possibilityField}
            phase={progress}
          />
        )}
      </div>

      {/* Top bar */}
      <motion.div animate={{ opacity: progress > 0.1 ? 0.5 : 0 }}
        className="absolute top-4 left-4 right-4 z-20 flex justify-between"
      >
        <span style={{ fontSize: 9, color: "rgba(120,160,200,0.5)", fontFamily: "monospace", letterSpacing: "0.15em" }}>
          {phaseLabels[phase]}
        </span>
        <span style={{ fontSize: 9, color: "rgba(100,140,180,0.4)", fontFamily: "monospace" }}>
          R:{relCount} P:{pathCount} S:{(state?.fieldStability || 0).toFixed(2)}
        </span>
      </motion.div>

      {/* Philosophical statements */}
      <AnimatePresence>
        {phase !== "void" && phase !== "entry" && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 0.3 }} exit={{ opacity: 0 }}
            className="absolute bottom-24 left-0 right-0 text-center z-20 pointer-events-none"
          >
            <motion.p
              key={phase}
              initial={{ opacity: 0, y: 4 }} animate={{ opacity: 0.3, y: 0 }}
              style={{ fontSize: 10, color: "rgba(140,180,220,0.4)", fontFamily: "monospace", letterSpacing: "0.1em" }}
            >
              {phase === "seeds" && "existence = relation"}
              {phase === "observer" && "consciousness = being observed"}
              {phase === "collapse" && "reality = probability convergence"}
            </motion.p>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Observe button */}
      <AnimatePresence>
        {phase === "observer" && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="absolute bottom-20 left-0 right-0 flex justify-center z-20">
            <motion.button
              whileHover={{ opacity: 0.8 }}
              onClick={handleObserve}
              style={{
                padding: "5px 20px", borderRadius: 2, border: "1px solid rgba(120,160,200,0.3)",
                background: "rgba(20,40,60,0.4)", color: "rgba(140,180,220,0.6)", fontSize: 10,
                fontFamily: "monospace", cursor: "pointer", letterSpacing: "0.15em",
              }}
            >
              OBSERVE FIELD
            </motion.button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Entry actions */}
      <AnimatePresence>
        {phase === "entry" && (
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
            className="absolute bottom-10 left-0 right-0 flex justify-center gap-24 z-20">
            <button onClick={handleBack} style={{ background: "none", border: "none", color: "rgba(255,255,255,0.2)", fontSize: 11, fontFamily: "monospace", cursor: "pointer" }}>
              [ BACK ]
            </button>
            <button onClick={handleEnterChat} style={{ background: "none", border: "none", color: "rgba(140,180,220,0.5)", fontSize: 12, fontFamily: "monospace", cursor: "pointer" }}>
              [ ENTER FIELD ]
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </main>
  );
}