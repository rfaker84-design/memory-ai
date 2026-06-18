"use client";

const KEYS = {
  phone: "yj_phone",
  userId: "yj_uid",
  memoryId: "yj_mid",
  memoryName: "yj_mname",
  session: "yj_sess",
  emotion: "yj_emo",
} as const;

const LEGACY = {
  phone: "yijian_phone",
  userId: "yijian_user_id",
  session: "yijian_session",
} as const;

function ssr(): boolean { return typeof window === "undefined"; }
function get(k: string): string | null { if (ssr()) return null; return localStorage.getItem(k); }
function set(k: string, v: string): void { if (ssr()) return; localStorage.setItem(k, v); }

function migrate(legacyKey: string, newKey: string): string | null {
  const v = get(legacyKey);
  if (v) { set(newKey, v); }
  return v;
}

// ─── Read emotion from unified emotionEngine store ──────────
function getUnifiedEmotion(): string {
  if (ssr()) return "calm";
  try {
    const raw = localStorage.getItem("yj_emo_state");
    if (raw) {
      const state = JSON.parse(raw);
      return state.type || "calm";
    }
  } catch {}
  return get(KEYS.emotion) || "calm";
}

export const store = {
  getPhone: (): string => { if (ssr()) return ""; return get(KEYS.phone) || migrate(LEGACY.phone, KEYS.phone) || ""; },
  setPhone: (v: string) => { set(KEYS.phone, v); set(LEGACY.phone, v); },

  getUserId: (): string => { if (ssr()) return ""; return get(KEYS.userId) || migrate(LEGACY.userId, KEYS.userId) || ""; },
  setUserId: (v: string) => { set(KEYS.userId, v); set(LEGACY.userId, v); },

  ensureUserId: (): string => {
    let id = store.getUserId();
    if (!id) { id = crypto.randomUUID(); store.setUserId(id); }
    return id;
  },

  getMemoryId: (): string => { if (ssr()) return ""; return get(KEYS.memoryId) || ""; },
  setMemoryId: (v: string) => set(KEYS.memoryId, v),

  getMemoryName: (): string => { if (ssr()) return ""; return get(KEYS.memoryName) || ""; },
  setMemoryName: (v: string) => set(KEYS.memoryName, v),

  getSession: (): string => { if (ssr()) return ""; return get(KEYS.session) || migrate(LEGACY.session, KEYS.session) || ""; },
  setSession: (v: string) => { set(KEYS.session, v); set(LEGACY.session, v); },

  // Emotion — reads from unified emotionEngine store (yj_emo_state) for consistency
  // Falls back to legacy yj_emo key
  getEmotion: (): string => getUnifiedEmotion(),

  // Legacy setter — also writes to unified store for bridge compatibility
  setEmotion: (v: string) => {
    set(KEYS.emotion, v);
    // Also update the emotionEngine store
    try {
      const state = { type: v, intensity: 0.5, lastUpdated: Date.now(), source: "system" };
      localStorage.setItem("yj_emo_state", JSON.stringify(state));
    } catch {}
  },

  getChatContext: () => ({
    userId: store.getUserId(),
    memoryId: store.getMemoryId(),
    name: store.getMemoryName() || "TA",
    emotion: store.getEmotion(),
    phone: store.getPhone(),
  }),

  clear: () => {
    Object.values(KEYS).forEach((k) => { try { localStorage.removeItem(k); } catch {} });
  },
};
