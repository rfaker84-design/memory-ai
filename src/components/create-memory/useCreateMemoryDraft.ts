"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { CreateDraft, CreateStatus, emptyDraft } from "./types";
import { draftForStorage } from "./createMemoryLogic";

const KEY = "memoryai:create-memory:draft:v1";
const IDEMPOTENCY_KEY = "memoryai:create-memory:idempotency:v1";

function createIntentKey(): string {
  return globalThis.crypto?.randomUUID?.() ?? `memory-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function useCreateMemoryDraft() {
  const [draft, setDraft] = useState<CreateDraft>(emptyDraft);
  const [status, setStatus] = useState<CreateStatus>("loading");
  const [idempotencyKey, setIdempotencyKey] = useState("");
  const hydrated = useRef(false);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(KEY);
      if (saved) setDraft({ ...emptyDraft, ...JSON.parse(saved), consent: false });
      const existingKey = localStorage.getItem(IDEMPOTENCY_KEY);
      const nextKey = existingKey || createIntentKey();
      if (!existingKey) localStorage.setItem(IDEMPOTENCY_KEY, nextKey);
      setIdempotencyKey(nextKey);
      setStatus("editing");
    } catch {
      setStatus("recoverable-error");
    } finally {
      hydrated.current = true;
    }
  }, []);

  useEffect(() => {
    if (!hydrated.current) return;
    const timer = window.setTimeout(() => {
      setStatus(current => current === "editing" ? "saving-draft" : current);
      try {
        localStorage.setItem(KEY, JSON.stringify(draftForStorage(draft)));
        setStatus(current => current === "saving-draft" ? "editing" : current);
      } catch { setStatus("recoverable-error"); }
    }, 500);
    return () => window.clearTimeout(timer);
  }, [draft]);

  const update = useCallback(<K extends keyof CreateDraft>(key: K, value: CreateDraft[K]) => {
    setDraft(current => ({ ...current, [key]: value }));
    setStatus("editing");
  }, []);

  const clear = useCallback(() => {
    localStorage.removeItem(KEY);
    localStorage.removeItem(IDEMPOTENCY_KEY);
  }, []);
  return { draft, status, setStatus, update, clear, idempotencyKey };
}
