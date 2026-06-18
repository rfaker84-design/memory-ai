/* ============================================================
   忆见 MemoryAI — Tab State Store
   Four tabs = four states of the same dream space.
   No page routing. No scene reloading.
   ============================================================ */

export type TabMode = "home" | "chat" | "memory" | "profile";

export interface TabState {
  mode: TabMode;
}

let state: TabState = { mode: "home" };
type Listener = (s: TabState) => void;
const listeners: Listener[] = [];

export function getTabState(): Readonly<TabState> {
  return state;
}

export function setTabMode(mode: TabMode): void {
  state = { ...state, mode };
  notify();
}

export function subscribeTab(fn: Listener): () => void {
  listeners.push(fn);
  return () => {
    const idx = listeners.indexOf(fn);
    if (idx >= 0) listeners.splice(idx, 1);
  };
}

function notify(): void {
  const s = { ...state };
  for (const fn of listeners) {
    try { fn(s); } catch {}
  }
}