"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { persistCompanionPrimaryPreference } from "../companion/companionHomeState";
import { guestActionHandoff, resolveGuestAction, type GuestActionMemory, type GuestIntent } from "./guestActionContinuation";

export function useGuestAction(intent: GuestIntent) {
  const router = useRouter();
  const [loginOpen, setLoginOpen] = useState(false);
  const [choices, setChoices] = useState<GuestActionMemory[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const owner = useRef<string | null>(null);
  const active = useRef<AbortController | null>(null);
  useEffect(() => () => { active.current?.abort(); active.current = null; }, []);

  const choose = (memory: GuestActionMemory) => {
    if (!owner.current) return;
    const route = guestActionHandoff.bind(owner.current, memory.id);
    if (!route) return;
    if (intent.kind === "pickup") guestActionHandoff.clear();
    persistCompanionPrimaryPreference(window.localStorage, memory.userId, memory.id);
    setChoices([]);
    router.push(route);
  };

  const continueAction = async () => {
    if (active.current) return;
    if (intent.kind === "chat" && !intent.text.trim()) { setError("先写一句想说的话。"); return; }
    const controller = new AbortController();
    active.current = controller;
    setBusy(true); setError("");
    try {
      const result = await resolveGuestAction(window.localStorage, fetch, controller.signal);
      if (controller.signal.aborted) return;
      if (result.status === "login") { setLoginOpen(true); return; }
      owner.current = result.ownerId;
      guestActionHandoff.remember(result.ownerId, intent);
      setLoginOpen(false);
      if (result.selected) choose(result.selected);
      else if (result.memories.length) setChoices(result.memories);
      else router.push("/create-memory");
    } catch (cause) {
      if (controller.signal.aborted) return;
      setLoginOpen(false);
      setError(cause instanceof Error ? cause.message : "暂时无法继续，请稍后重试。");
    } finally { if (active.current === controller) { active.current = null; setBusy(false); } }
  };

  return { loginOpen, closeLogin: () => { active.current?.abort(); active.current = null; setBusy(false); setLoginOpen(false); }, choices, choose, cancelChoice: () => { setChoices([]); guestActionHandoff.clear(); }, error, busy, continueAction };
}
