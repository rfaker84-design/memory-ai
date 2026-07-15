"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { store } from "../../src/lib/store";
import { getEmotionState } from "../../src/lib/emotionEngine";

export default function MemoryRoomPage() {
  const router = useRouter();

  useEffect(() => {
      // Sync emotion state
  const es = getEmotionState();
  if (es.source !== "init") store.setEmotion(es.type);
  const mid = store.getMemoryId();
    if (mid) {
      router.replace("/memory/" + mid);
    } else {
      fetch("/api/memories", { cache: "no-store", credentials: "same-origin" })
        .then(async (response) => response.ok ? response.json() : [])
        .then((memories: { id: string }[]) => {
          router.replace(memories.length > 0 ? "/memory/" + memories[0].id : "/");
        })
        .catch(() => router.replace("/"));
    }
  }, [router]);

  return null;
}
