"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { listLongTermMemories } from "./longTermMemoryBetaClient";

export function LongTermMemoryBetaEntry({ memoryId }: { memoryId: string }) {
  const router = useRouter();
  const [available, setAvailable] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    void listLongTermMemories(memoryId, controller.signal)
      .then(() => setAvailable(true))
      .catch(() => setAvailable(false));
    return () => controller.abort();
  }, [memoryId]);

  if (!available) return null;

  return (
    <button
      type="button"
      onClick={() =>
        router.push(`/memory/${encodeURIComponent(memoryId)}/long-term-memory`)
      }
      style={{
        position: "absolute",
        zIndex: 20,
        top: "calc(env(safe-area-inset-top, 0px) + 18px)",
        right: 18,
        minHeight: 42,
        padding: "0 16px",
        borderRadius: 999,
        border: "1px solid rgba(216, 190, 146, 0.18)",
        background: "rgba(20, 18, 16, 0.78)",
        color: "rgba(244, 232, 210, 0.78)",
        fontSize: 12,
        cursor: "pointer",
      }}
    >
      内测记忆
    </button>
  );
}
