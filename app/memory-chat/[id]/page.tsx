"use client";

import { use, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import type { Memory } from "../../../features/memory/types";
import { CreationMediaRecoveryGate } from "../../../src/components/first-presence/CreationMediaRecoveryGate";
import {
  clearCreationRecovery,
  readCreationRecovery,
} from "../../../src/components/first-presence/creationRecoveryClient";
import {
  loadOwnedMediaUrl,
  loadOwnedMemory,
  OwnedMemoryRequestError,
} from "../../../src/components/memory/ownedMemoryClient";
import styles from "./page.module.css";

type PageState =
  | { status: "loading" }
  | { status: "ready"; memory: Memory; portraitUrl: string | null }
  | { status: "unauthenticated" | "not-found" | "error" };

function firstGreetingKey(memoryId: string) {
  return `first-greeting-${memoryId}`;
}

export default function MemoryChatPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const [state, setState] = useState<PageState>({ status: "loading" });

  useEffect(() => {
    const controller = new AbortController();
    setState({ status: "loading" });

    void loadOwnedMemory(id, controller.signal)
      .then(async (memory) => {
        let portraitUrl = memory.photoUrl ?? null;
        if (memory.photoAssetId) {
          try {
            portraitUrl = await loadOwnedMediaUrl(memory.photoAssetId, controller.signal);
          } catch {
            portraitUrl = null;
          }
        }
        if (!controller.signal.aborted) {
          setState({ status: "ready", memory, portraitUrl });
        }
      })
      .catch((error) => {
        if (controller.signal.aborted) return;
        if (error instanceof OwnedMemoryRequestError && error.status === 401) {
          clearCreationRecovery();
          setState({ status: "unauthenticated" });
          router.replace("/login");
        } else if (error instanceof OwnedMemoryRequestError && error.status === 404) {
          if (readCreationRecovery()?.memoryId === id) {
            clearCreationRecovery();
          }
          setState({ status: "not-found" });
        } else {
          setState({ status: "error" });
        }
      });

    return () => controller.abort();
  }, [id, router]);

  if (state.status !== "ready") {
    const copy = state.status === "unauthenticated"
      ? "请先重新登录，再回到这段记忆。"
      : state.status === "not-found"
        ? "暂时找不到这段记忆。"
        : state.status === "error"
          ? "这段记忆暂时没有打开，请稍后再试。"
          : "正在回到这段记忆…";
    return (
      <main className={styles.loading}>
        <div className={styles.stars} aria-hidden="true" />
        <p>{copy}</p>
        {state.status !== "loading" && (
          <button type="button" onClick={() => router.replace("/")}>回到首页</button>
        )}
      </main>
    );
  }

  return (
    <main className={styles.page}>
      <div className={styles.stars} aria-hidden="true" />
      <CreationMediaRecoveryGate
        memory={state.memory}
        firstGreetingKey={firstGreetingKey(state.memory.id)}
        initialPortraitUrl={state.portraitUrl}
        onLeave={() => router.replace("/")}
      />
    </main>
  );
}
