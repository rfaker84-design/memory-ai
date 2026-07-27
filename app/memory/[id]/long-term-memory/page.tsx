"use client";

import { use, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import type { LongTermMemory } from "@/features/long-term-memory";
import { loadOwnedMemory } from "@/src/components/memory/ownedMemoryClient";
import {
  correctLongTermMemory,
  deleteLongTermMemory,
  listLongTermMemories,
  LongTermMemoryBetaRequestError,
} from "@/src/components/long-term-memory/longTermMemoryBetaClient";
import styles from "./page.module.css";

type LoadState = "loading" | "ready" | "unavailable" | "error";

export default function LongTermMemoryBetaPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: memoryId } = use(params);
  const router = useRouter();
  const [memoryName, setMemoryName] = useState("");
  const [items, setItems] = useState<LongTermMemory[]>([]);
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [message, setMessage] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    setLoadState("loading");
    Promise.all([
      loadOwnedMemory(memoryId, controller.signal),
      listLongTermMemories(memoryId, controller.signal),
    ])
      .then(([memory, memories]) => {
        setMemoryName(memory.name);
        setItems(memories);
        setLoadState("ready");
      })
      .catch((error) => {
        if (controller.signal.aborted) return;
        setLoadState(
          error instanceof LongTermMemoryBetaRequestError
          && error.code === "BETA_NOT_AVAILABLE"
            ? "unavailable"
            : "error"
        );
      });
    return () => controller.abort();
  }, [memoryId]);

  async function save(item: LongTermMemory) {
    if (!draft.trim() || busyId) return;
    setBusyId(item.id);
    setMessage("");
    try {
      const updated = await correctLongTermMemory(memoryId, item.id, draft);
      setItems((current) =>
        current.map((candidate) => (candidate.id === item.id ? updated : candidate))
      );
      setEditingId(null);
      setMessage("已保存更正，后续对话会使用新内容。");
    } catch {
      setMessage("更正未保存，请稍后重试。");
    } finally {
      setBusyId(null);
    }
  }

  async function remove(item: LongTermMemory) {
    if (
      busyId
      || !window.confirm("删除后，这条内容不会再用于后续对话。确认删除吗？")
    ) {
      return;
    }
    setBusyId(item.id);
    setMessage("");
    try {
      await deleteLongTermMemory(memoryId, item.id);
      setItems((current) => current.filter((candidate) => candidate.id !== item.id));
      setMessage("已删除，这条内容不会再被召回。");
    } catch {
      setMessage("删除未完成，请稍后重试。");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <button
          type="button"
          className={styles.back}
          onClick={() => router.push(`/memory/${encodeURIComponent(memoryId)}`)}
        >
          返回
        </button>
        <div>
          <p className={styles.eyebrow}>长期记忆 · 内测</p>
          <h1>{memoryName || "TA"} 记住的内容</h1>
        </div>
      </header>

      {loadState === "loading" && <p className={styles.state}>正在读取真实记忆…</p>}
      {loadState === "unavailable" && (
        <p className={styles.state}>此入口仅对隔离环境中的内测账号开放。</p>
      )}
      {loadState === "error" && (
        <p className={styles.state}>暂时无法读取，请稍后再试。</p>
      )}

      {loadState === "ready" && (
        <>
          <section className={styles.notice}>
            <p>这里展示从真实对话中留下的内容。你可以逐条查看、更正和删除。</p>
            <p>这些内容只服务于当前内测体验，不会用于训练模型。</p>
          </section>

          {message && <p className={styles.message}>{message}</p>}

          {items.length === 0 ? (
            <section className={styles.empty}>
              <h2>还没有长期记忆</h2>
              <p>在对话中讲到家庭、经历或偏好后，可回到这里查看。</p>
            </section>
          ) : (
            <section className={styles.list} aria-label="长期记忆列表">
              {items.map((item) => (
                <article className={styles.item} key={item.id}>
                  <div className={styles.meta}>
                    <span>{item.metadata.userCorrected === true ? "已由你更正" : "来自对话"}</span>
                    <time dateTime={item.updatedAt}>
                      {new Date(item.updatedAt).toLocaleDateString("zh-CN")}
                    </time>
                  </div>
                  {editingId === item.id ? (
                    <textarea
                      className={styles.editor}
                      value={draft}
                      maxLength={8_000}
                      autoFocus
                      onChange={(event) => setDraft(event.target.value)}
                    />
                  ) : (
                    <p className={styles.content}>{item.content}</p>
                  )}
                  <div className={styles.actions}>
                    {editingId === item.id ? (
                      <>
                        <button
                          type="button"
                          onClick={() => void save(item)}
                          disabled={busyId === item.id || !draft.trim()}
                        >
                          保存更正
                        </button>
                        <button
                          type="button"
                          onClick={() => setEditingId(null)}
                          disabled={busyId === item.id}
                        >
                          取消
                        </button>
                      </>
                    ) : (
                      <>
                        <button
                          type="button"
                          onClick={() => {
                            setEditingId(item.id);
                            setDraft(item.content);
                            setMessage("");
                          }}
                        >
                          更正
                        </button>
                        <button
                          type="button"
                          className={styles.delete}
                          onClick={() => void remove(item)}
                          disabled={busyId === item.id}
                        >
                          删除
                        </button>
                      </>
                    )}
                  </div>
                </article>
              ))}
            </section>
          )}
        </>
      )}
    </main>
  );
}
