/**
 * 忆见 MemoryAI — User Journey Tracking
 * 记录用户行为漏斗，优化留存和转化
 * 
 * 漏斗:
 *   homepage_view → click_enter → input_start → input_complete
 *   → avatar_generated → first_message_sent → return_visit
 */

import { createClient } from "@supabase/supabase-js";

/* =========================================================================
   Types
   ========================================================================= */

export type JourneyStep =
  | "homepage_view"
  | "homepage_idle_5s"
  | "click_enter"
  | "input_start"
  | "input_step_1" | "input_step_2" | "input_step_3"
  | "input_step_4" | "input_step_5" | "input_step_6"
  | "input_idle_20s"
  | "input_idle_40s"
  | "input_complete"
  | "avatar_generation_start"
  | "avatar_generation_phase_1" | "avatar_generation_phase_2" | "avatar_generation_phase_3"
  | "avatar_generated"
  | "chat_enter"
  | "chat_idle_5s"
  | "chat_idle_10s"
  | "first_message_sent"
  | "drop_off";

export interface JourneyEvent {
  step: JourneyStep;
  timestamp: number;
  memoryId?: string;
  duration?: number;     // ms since previous step
  metadata?: Record<string, unknown>;
}

/* =========================================================================
   In-memory session store (per browser tab)
   ========================================================================= */

const sessionHistory: JourneyEvent[] = [];
const sessionStart = Date.now();
let lastStepTime = Date.now();

export function trackJourney(step: JourneyStep, metadata?: Record<string, unknown>): void {
  const now = Date.now();
  const duration = now - lastStepTime;
  lastStepTime = now;

  const event: JourneyEvent = { step, timestamp: now, duration, metadata };
  sessionHistory.push(event);

  // Persist to Supabase (fire and forget)
  persistEvent(event);
}

export function getJourneyFunnel(): Record<string, { count: number; pct: number }> {
  const total = sessionHistory.length;
  const steps = [
    "homepage_view", "click_enter", "input_start", "input_complete",
    "avatar_generated", "first_message_sent",
  ];

  const funnel: Record<string, { count: number; pct: number }> = {};
  let prevCount = total;

  for (const step of steps) {
    const found = sessionHistory.some(e => e.step === step);
    const entry = { count: found ? 1 : 0, pct: total > 0 ? Math.round(((found ? 1 : 0) / total) * 100) : 0 };
    funnel[step] = entry;
    prevCount = found ? 1 : 0;
  }

  return funnel;
}

export function getSessionDuration(): number {
  return Date.now() - sessionStart;
}

export function getDropOffStep(): JourneyStep | null {
  if (sessionHistory.length === 0) return null;
  return sessionHistory[sessionHistory.length - 1].step;
}

/* =========================================================================
   Persistence
   ========================================================================= */

async function persistEvent(event: JourneyEvent): Promise<void> {
  try {
    const phone = typeof localStorage !== "undefined" ? localStorage.getItem("yijian_phone") : null;
    if (!phone) return;

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL || "",
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ""
    );

    await supabase.from("user_journey_log").insert({
      user_phone: phone,
      step: event.step,
      timestamp: new Date(event.timestamp).toISOString(),
      duration_ms: event.duration || 0,
      metadata: event.metadata || {},
    });
  } catch {
    // Non-critical: journey tracking is fire-and-forget
  }
}

/* =========================================================================
   Pressure Balance — auto-adjust based on behavior
   ========================================================================= */

export interface PressureState {
  intensity: "normal" | "reduced" | "minimal";
  shouldSimplifyUI: boolean;
  shouldReduceMotion: boolean;
  showExtraGuidance: boolean;
}

let dropOffCount = 0;

export function recordDropOff(): void {
  dropOffCount++;
  trackJourney("drop_off");
}

export function getPressureState(): PressureState {
  if (dropOffCount >= 3) {
    return {
      intensity: "minimal",
      shouldSimplifyUI: true,
      shouldReduceMotion: true,
      showExtraGuidance: true,
    };
  }
  if (dropOffCount >= 1) {
    return {
      intensity: "reduced",
      shouldSimplifyUI: true,
      shouldReduceMotion: false,
      showExtraGuidance: true,
    };
  }
  return {
    intensity: "normal",
    shouldSimplifyUI: false,
    shouldReduceMotion: false,
    showExtraGuidance: false,
  };
}