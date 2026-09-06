"use client";

import { fetchAuthRequestJson } from "./authRequestClient";
import { fetchOwnedMemoryListJson } from "../memory/ownedMemoryClient";
import { resolveCompanionPrimaryPreference, type CompanionPrimaryStorage } from "../companion/companionHomeState";

export type GuestIntent = { kind: "chat"; text: string } | { kind: "pickup" };
export type GuestActionMemory = { id: string; userId: string; name: string };
type PendingAction = { ownerId: string; memoryId: string | null; intent: GuestIntent; expiresAt: number };

// One explicit action, in this document lifetime only. Never persist personal
// text in a URL or browser storage, and never send a recovered draft by itself.
export class GuestActionHandoff {
  private pending: PendingAction | null = null;
  hasPending() { return this.pending !== null && this.pending.expiresAt > Date.now(); }
  remember(ownerId: string, intent: GuestIntent, now = Date.now()) {
    this.pending = { ownerId, intent, memoryId: null, expiresAt: now + 15 * 60_000 };
  }
  read(ownerId: string, now = Date.now()) {
    if (this.pending && (this.pending.ownerId !== ownerId || this.pending.expiresAt <= now)) this.pending = null;
    return this.pending;
  }
  bind(ownerId: string, memoryId: string) {
    const pending = this.read(ownerId);
    if (!pending || (pending.memoryId && pending.memoryId !== memoryId)) return null;
    pending.memoryId = memoryId;
    return pending.intent.kind === "chat"
      ? `/memory-chat/${encodeURIComponent(memoryId)}`
      : `/memory/${encodeURIComponent(memoryId)}/pickup`;
  }
  takeChat(ownerId: string, memoryId: string) {
    const pending = this.read(ownerId);
    if (!pending || pending.memoryId !== memoryId || pending.intent.kind !== "chat") return null;
    this.pending = null;
    return pending.intent.text;
  }
  clear() { this.pending = null; }
}

export const guestActionHandoff = new GuestActionHandoff();

export async function guestActionSessionOwner(request: typeof fetch = fetch, signal?: AbortSignal) {
  const { response, body } = await fetchAuthRequestJson("/api/auth/session", {
    credentials: "same-origin", cache: "no-store",
  }, request, signal);
  if (response.status === 401) return null;
  const session = body as { authenticated?: unknown; user?: { id?: unknown } } | null;
  if (!response.ok || session?.authenticated !== true || typeof session.user?.id !== "string" || !session.user.id) {
    throw new Error("暂时无法确认登录状态，请稍后重试。");
  }
  return session.user.id;
}

export async function resolveGuestAction(storage: CompanionPrimaryStorage, request: typeof fetch = fetch, signal?: AbortSignal) {
  const ownerId = await guestActionSessionOwner(request, signal);
  if (!ownerId) return { status: "login" as const };
  const { response, body } = await fetchOwnedMemoryListJson(signal, request);
  if (response.status === 401) return { status: "login" as const };
  if (!response.ok || !Array.isArray(body) || !body.every((item: unknown) => {
    const value = item as Partial<GuestActionMemory> | null;
    return value && typeof value.id === "string" && value.id && typeof value.userId === "string" && value.userId && typeof value.name === "string";
  })) throw new Error("暂时无法读取你的 TA，刚才的输入仍保留在这里。");
  const memories = body as GuestActionMemory[];
  if (memories.some((memory) => memory.userId !== memories[0].userId)) throw new Error("人物资料尚未确认，请重新读取。");
  const selected = memories.length ? resolveCompanionPrimaryPreference(memories, memories[0].userId, storage, { allowSingleMemoryFallback: false }).memory : null;
  return { status: "ready" as const, ownerId, memories, selected };
}
