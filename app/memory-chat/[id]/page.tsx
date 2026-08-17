"use client";

import { use, useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import type { Memory } from "../../../features/memory/types";
import { persistCompanionPrimaryPreference } from "../../../src/components/companion/companionHomeState";
import { CreationMediaRecoveryGate } from "../../../src/components/first-presence/CreationMediaRecoveryGate";
import { MemoryConversationScene } from "../../../src/components/first-presence/MemoryConversationScene";
import {
  clearCreationRecovery,
  consumeCreationChatHandoff,
  readCreationRecovery,
} from "../../../src/components/first-presence/creationRecoveryClient";
import {
  loadOwnedMediaUrl,
  loadOwnedMemory,
  OwnedMemoryRequestError,
} from "../../../src/components/memory/ownedMemoryClient";
import { MotionProvider } from "../../../src/motion";
import styles from "./page.module.css";

type PageState =
  | { status: "loading" }
  | { status: "ready"; memory: Memory; portraitUrl: string | null; requiresMediaRecovery: boolean }
  | { status: "unauthenticated" | "not-found" | "timeout" | "error" };

function firstGreetingKey(memoryId: string) {
  return `first-greeting-${memoryId}`;
}

export default function MemoryChatPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const [state, setState] = useState<PageState>({ status: "loading" });

  const load = useCallback(async (signal?: AbortSignal) => {
    setState({ status: "loading" });
    try {
      const memory = await loadOwnedMemory(id, signal);
      let portraitUrl = memory.photoUrl ?? null;
      if (memory.photoAssetId) {
        try {
          portraitUrl = await loadOwnedMediaUrl(memory.photoAssetId, signal);
        } catch {
          portraitUrl = null;
        }
      }
      if (signal?.aborted) return;
      const requiresMediaRecovery = readCreationRecovery()?.memoryId === memory.id;
      const creationChatHandoff = consumeCreationChatHandoff(memory.id);
      // A direct chat entry is an explicit choice. Creation recovery is not:
      // it must never replace an existing companion preference with a newly
      // created person merely because its handoff opened this route.
      if (!requiresMediaRecovery && !creationChatHandoff && memory.userId) {
        persistCompanionPrimaryPreference(window.localStorage, memory.userId, memory.id);
      }
      setState({
        status: "ready",
        memory,
        portraitUrl,
        requiresMediaRecovery,
      });
    } catch (error) {
      if (signal?.aborted) return;
      if (error instanceof OwnedMemoryRequestError && error.status === 401) {
        clearCreationRecovery();
        setState({ status: "unauthenticated" });
        router.replace("/login");
      } else if (error instanceof OwnedMemoryRequestError && error.status === 404) {
        if (readCreationRecovery()?.memoryId === id) {
          clearCreationRecovery();
        }
        setState({ status: "not-found" });
      } else if (error instanceof OwnedMemoryRequestError && error.status === 408) {
        setState({ status: "timeout" });
      } else {
        setState({ status: "error" });
      }
    }
  }, [id, router]);

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load]);

  if (state.status !== "ready") {
    const copy = state.status === "unauthenticated"
      ? "请先重新登录，再回到这段记忆。"
      : state.status === "not-found"
        ? "暂时找不到这段记忆。"
        : state.status === "timeout"
          ? "读取等待过久，尚未创建或修改任何内容。"
        : state.status === "error"
          ? "这段记忆暂时没有打开，请稍后再试。"
          : "正在回到这段记忆…";
    return (
      <main className={styles.loading}>
        <p
          role={state.status === "loading" ? "status" : "alert"}
          aria-live={state.status === "loading" ? "polite" : "assertive"}
        >{copy}</p>
        {(state.status === "timeout" || state.status === "error") && <button type="button" onClick={() => void load()}>重新读取</button>}
        {state.status !== "loading" && (
          <button type="button" onClick={() => router.replace("/companion")}>返回相伴</button>
        )}
      </main>
    );
  }

  const conversation = (
    <MemoryConversationScene
      memoryId={state.memory.id}
      memoryName={state.memory.name}
      firstGreetingKey={firstGreetingKey(state.memory.id)}
      initialPortraitUrl={state.portraitUrl}
      onLeave={() => router.replace("/companion")}
    />
  );

  return (
    <main className={`${styles.page} ${state.requiresMediaRecovery ? "" : styles.chatPage}`}>
      <MotionProvider>
        {state.requiresMediaRecovery ? (
          <CreationMediaRecoveryGate
            memory={state.memory}
            firstGreetingKey={firstGreetingKey(state.memory.id)}
            initialPortraitUrl={state.portraitUrl}
            onLeave={() => router.replace("/companion")}
          />
        ) : conversation}
      </MotionProvider>
    </main>
  );
}
