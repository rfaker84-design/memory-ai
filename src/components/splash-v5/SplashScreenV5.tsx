"use client";
import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import MemoryWorldRenderer from "./MemoryWorldRenderer";
import type { WorldConfig } from "../../lib/world-types";

interface Props {
  memoryId: string;
  memoryName: string;
  onComplete: () => void;
}

export default function SplashScreenV5({ memoryId, memoryName, onComplete }: Props) {
  const [world, setWorld] = useState<WorldConfig | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch("/api/world-config", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ memoryId }),
        });
        if (res.ok && !cancelled) {
          const data = await res.json();
          setWorld(data);
        } else if (!cancelled) {
          setError(true);
        }
      } catch {
        if (!cancelled) setError(true);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [memoryId]);

  // On error, skip splash
  useEffect(() => {
    if (error) onComplete();
  }, [error, onComplete]);

  if (error) return null;
  if (!world) {
    return (
      <div className="fixed inset-0 z-[9999] flex items-center justify-center" style={{ background: "#020208" }}>
        <motion.p
          animate={{ opacity: [0.2, 0.5, 0.2] }}
          transition={{ duration: 2.5, repeat: Infinity }}
          style={{ fontSize: 14, color: "rgba(255,255,255,0.3)", letterSpacing: "0.15em" }}
        >
          正在构建记忆世界...
        </motion.p>
      </div>
    );
  }

  return (
    <MemoryWorldRenderer
      world={world}
      memoryId={memoryId}
      memoryName={memoryName}
    />
  );
}