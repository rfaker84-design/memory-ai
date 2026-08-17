"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { CreateDraft, CreateStatus, emptyDraft } from "./types";
import { draftForStorage } from "./createMemoryLogic";

export const CREATE_MEMORY_DRAFT_STORAGE_KEY = "memoryai:create-memory:draft:v1";
export const CREATE_MEMORY_IDEMPOTENCY_STORAGE_KEY = "memoryai:create-memory:idempotency:v1";

export type CreateMemoryDraftStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

export function clearPersistedCreateMemoryDraft(storage: CreateMemoryDraftStorage | null): boolean {
  if (!storage) return false;
  try {
    storage.removeItem(CREATE_MEMORY_DRAFT_STORAGE_KEY);
    storage.removeItem(CREATE_MEMORY_IDEMPOTENCY_STORAGE_KEY);
    return true;
  } catch {
    return false;
  }
}

function createIntentKey(): string {
  return globalThis.crypto?.randomUUID?.() ?? `memory-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function useCreateMemoryDraft() {
  const [draft, setDraft] = useState<CreateDraft>(emptyDraft);
  const [status, setStatus] = useState<CreateStatus>("loading");
  const [idempotencyKey, setIdempotencyKey] = useState("");
  const hydrated = useRef(false);
  const autosaveTimer = useRef<number | null>(null);
  const persistenceSuppressed = useRef(false);
  const idempotencyKeyRef = useRef("");

  useEffect(() => {
    try {
      const saved = localStorage.getItem(CREATE_MEMORY_DRAFT_STORAGE_KEY);
      if (saved) setDraft({ ...emptyDraft, ...JSON.parse(saved), consent: false });
      const existingKey = localStorage.getItem(CREATE_MEMORY_IDEMPOTENCY_STORAGE_KEY);
      const nextKey = existingKey || createIntentKey();
      if (!existingKey) localStorage.setItem(CREATE_MEMORY_IDEMPOTENCY_STORAGE_KEY, nextKey);
      idempotencyKeyRef.current = nextKey;
      setIdempotencyKey(nextKey);
      setStatus("editing");
    } catch {
      setStatus("recoverable-error");
    } finally {
      hydrated.current = true;
    }
  }, []);

  useEffect(() => {
    if (!hydrated.current || persistenceSuppressed.current) return;
    const timer = window.setTimeout(() => {
      if (autosaveTimer.current === timer) autosaveTimer.current = null;
      if (persistenceSuppressed.current) return;
      setStatus(current => current === "editing" ? "saving-draft" : current);
      try {
        localStorage.setItem(CREATE_MEMORY_DRAFT_STORAGE_KEY, JSON.stringify(draftForStorage(draft)));
        setStatus(current => current === "saving-draft" ? "editing" : current);
      } catch { setStatus("recoverable-error"); }
    }, 500);
    autosaveTimer.current = timer;
    return () => {
      window.clearTimeout(timer);
      if (autosaveTimer.current === timer) autosaveTimer.current = null;
    };
  }, [draft]);

  const update = useCallback(<K extends keyof CreateDraft>(key: K, value: CreateDraft[K]) => {
    if (persistenceSuppressed.current) {
      persistenceSuppressed.current = false;
      try {
        localStorage.setItem(CREATE_MEMORY_IDEMPOTENCY_STORAGE_KEY, idempotencyKeyRef.current);
      } catch {
        setStatus("recoverable-error");
      }
    }
    setDraft(current => ({ ...current, [key]: value }));
    setStatus("editing");
  }, []);

  const clear = useCallback(() => {
    persistenceSuppressed.current = true;
    if (autosaveTimer.current !== null) {
      window.clearTimeout(autosaveTimer.current);
      autosaveTimer.current = null;
    }
    clearPersistedCreateMemoryDraft(localStorage);
    const nextKey = createIntentKey();
    idempotencyKeyRef.current = nextKey;
    setIdempotencyKey(nextKey);
  }, []);
  return { draft, status, setStatus, update, clear, idempotencyKey };
}
