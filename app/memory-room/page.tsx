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
      const phone = store.getPhone();
      if (phone) {
        fetch("/api/memories-mvp?phone=" + encodeURIComponent(phone))
          .then(r => r.json())
          .then((memories: { id: string }[]) => {
            if (memories.length > 0) {
              router.replace("/memory/" + memories[0].id);
            } else {
              router.replace("/");
            }
          })
          .catch(() => router.replace("/"));
      } else {
        router.replace("/");
      }
    }
  }, [router]);

  return null;
}
