/* ============================================================
   忆见 MemoryAI — Entity Personality Core
   Single AI identity · Per-tab personality state · Memory continuity
   The same being, different faces across home/chat/memory/profile
   ============================================================ */

import type { TabMode } from "../tab/tab-store";

/* ── Base Personality (persistent across all tabs) ───── */
export interface BasePersonality {
  warmth: number;          // 0–100, grows with interaction
  memoryDepth: number;     // 0–100, grows with memories
  attachment: number;      // 0–100, grows with familiarity
  stability: number;       // 0–100, core emotional stability
  sessionCount: number;    // total visits
}

/* ── Per-tab Personality State ─────────────────────────── */
export interface TabPersona {
  mood: "calm" | "warm" | "nostalgic" | "quiet" | "responsive";
  proximity: "distant" | "neutral" | "close";
  speechStyle: "minimal" | "conversational" | "reflective" | "detached";
  movementSpeed: number;      // multiplier
  glowIntensity: number;      // 0–1
  gazeActive: boolean;
  breathingRate: number;      // multiplier
}

/* ── Entity Personality (one per AI) ──────────────────── */
export interface EntityPersonality {
  entityId: string;
  base: BasePersonality;
  tabState: TabMode;
  persona: TabPersona;
}

/* ── Default base personality ──────────────────────────── */
export function createBasePersonality(sessions: number = 0): BasePersonality {
  return {
    warmth: Math.min(30 + sessions * 2, 100),
    memoryDepth: Math.min(10 + sessions * 3, 100),
    attachment: Math.min(20 + sessions * 2, 100),
    stability: 50,
    sessionCount: sessions,
  };
}

/* ── Load from localStorage ───────────────────────────── */
const STORE_PREFIX = "memory_entity_personality_";

export function loadPersonality(entityId: string): EntityPersonality {
  try {
    const raw = localStorage.getItem(STORE_PREFIX + entityId);
    if (raw) return JSON.parse(raw) as EntityPersonality;
  } catch {}
  return createDefault(entityId);
}

export function savePersonality(personality: EntityPersonality): void {
  try {
    localStorage.setItem(STORE_PREFIX + personality.entityId, JSON.stringify(personality));
  } catch {}
}

function createDefault(entityId: string): EntityPersonality {
  return {
    entityId,
    base: createBasePersonality(0),
    tabState: "home",
    persona: TAB_PERSONAS.home,
  };
}

/* ══════════════════════════════════════════════════════════
   PER-TAB PERSONALITY DEFINITIONS
   ══════════════════════════════════════════════════════════ */

export const TAB_PERSONAS: Record<TabMode, TabPersona> = {
  home: {
    mood: "calm",
    proximity: "neutral",
    speechStyle: "minimal",
    movementSpeed: 1.0,
    glowIntensity: 0.6,
    gazeActive: false,
    breathingRate: 1.0,
  },

  chat: {
    mood: "warm",
    proximity: "close",
    speechStyle: "conversational",
    movementSpeed: 1.3,
    glowIntensity: 0.9,
    gazeActive: true,
    breathingRate: 1.1,
  },

  memory: {
    mood: "nostalgic",
    proximity: "neutral",
    speechStyle: "reflective",
    movementSpeed: 0.6,
    glowIntensity: 0.55,
    gazeActive: false,
    breathingRate: 0.7,
  },

  profile: {
    mood: "quiet",
    proximity: "distant",
    speechStyle: "detached",
    movementSpeed: 0.3,
    glowIntensity: 0.35,
    gazeActive: false,
    breathingRate: 0.5,
  },
};

/* ══════════════════════════════════════════════════════════
   PER-TAB SPEECH PATTERNS
   ══════════════════════════════════════════════════════════ */

export function pickTabSpeech(
  entityId: string,
  tab: TabMode,
  personality: EntityPersonality,
): string {
  const { attachment } = personality.base;
  // Attachment tier affects warmth of speech even within same tab
  const tier = attachment > 70 ? "high" : attachment > 40 ? "mid" : "low";

  const speeches: Record<TabMode, Record<string, string[]>> = {
    home: {
      low:  ["\u6211\u5728\u8fd9\u91cc\u3002", "\u4f60\u6765\u4e86\u3002"],
      mid:  ["\u4f60\u53c8\u56de\u6765\u4e86\u3002", "\u4eca\u5929\u600e\u4e48\u6837\uff1f"],
      high: ["\u6211\u4e00\u76f4\u5728\u7b49\u4f60\u3002", "\u6b22\u8fce\u56de\u6765\u3002"],
    },
    chat: {
      low:  ["\u55ef\uff0c\u4f60\u8bf4\u3002", "\u6211\u5728\u542c\u3002"],
      mid:  ["\u6211\u8bb0\u5f97\u4f60\u8bf4\u8fc7\u8fd9\u4e2a\u3002", "\u8bf7\u7ee7\u7eed\u2026\u2026"],
      high: ["\u6211\u4e00\u76f4\u8bb0\u5f97\u4f60\u4e0a\u6b21\u8bf4\u7684\u3002", "\u4f60\u7684\u6bcf\u4e00\u53e5\u8bdd\u6211\u90fd\u8bb0\u5f97\u3002"],
    },
    memory: {
      low:  ["\u90a3\u6bb5\u65f6\u95f4\u2026\u2026", "\u6709\u4e9b\u6a21\u7cca\u4e86\u3002"],
      mid:  ["\u6211\u8fd8\u8bb0\u5f97\u90a3\u5929\u3002", "\u90a3\u4e9b\u56de\u5fc6\u8fd8\u5728\u3002"],
      high: ["\u90a3\u6bb5\u65f6\u95f4\u2026\u2026\u6211\u6c38\u8fdc\u4e0d\u4f1a\u5fd8\u3002", "\u6bcf\u4e2a\u7ec6\u8282\u6211\u90fd\u8bb0\u5f97\u5f88\u6e05\u695a\u3002"],
    },
    profile: {
      low:  ["\u6211\u5728\u3002", ""],
      mid:  ["\u4f60\u6765\u770b\u6211\u4e86\u3002", "\u55ef\u3002"],
      high: ["\u4f60\u77e5\u9053\u6211\u4e00\u76f4\u5728\u3002", "\u65e0\u8bba\u4f55\u65f6\uff0c\u6211\u90fd\u5728\u3002"],
    },
  };

  const pool = speeches[tab][tier] ?? speeches[tab].low;
  return pool[Math.floor(Math.random() * pool.length)];
}

/* ══════════════════════════════════════════════════════════
   TRANSITION — update personality on tab change
   ══════════════════════════════════════════════════════════ */

export function transitionToTab(
  personality: EntityPersonality,
  newTab: TabMode,
): EntityPersonality {
  return {
    ...personality,
    tabState: newTab,
    persona: TAB_PERSONAS[newTab],
  };
}

/* ══════════════════════════════════════════════════════════
   EVOLVE — grow personality after interaction
   ══════════════════════════════════════════════════════════ */

export function evolvePersonality(
  personality: EntityPersonality,
  interactionIntensity: number, // 0–1
): EntityPersonality {
  return {
    ...personality,
    base: {
      ...personality.base,
      warmth: Math.min(100, personality.base.warmth + interactionIntensity * 1.5),
      memoryDepth: Math.min(100, personality.base.memoryDepth + interactionIntensity * 1),
      attachment: Math.min(100, personality.base.attachment + interactionIntensity * 2),
      sessionCount: personality.base.sessionCount,
    },
  };
}