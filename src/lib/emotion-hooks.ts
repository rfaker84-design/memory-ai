/**
 * Historical engagement-hook compatibility surface.
 *
 * The first-release product must not use sadness, loneliness, nighttime use,
 * return visits, or conversation depth to initiate contact.  Keep the public
 * types so an accidental legacy import still compiles, but fail closed: this
 * module never selects or emits a proactive message.
 */

export type HookTrigger =
  | "sad_arrival"
  | "lonely_arrival"
  | "night_visit"
  | "deep_conversation"
  | "return_after_leave"
  | "first_chat_today";

export interface HookResponse {
  trigger: HookTrigger;
  message: string;
  intensity: "warm" | "caring" | "deep" | "intense";
}

export interface EngagementSignals {
  emotion: string;
  hour: number;
  chatCountToday: number;
  daysSinceLastChat: number;
  isFirstToday?: boolean;
}

const NO_PROACTIVE_MESSAGE: HookResponse = {
  trigger: "first_chat_today",
  message: "",
  intensity: "warm",
};

export function detectHooks(_params: EngagementSignals): HookTrigger[] {
  return [];
}

export function getHookResponse(_trigger: HookTrigger): HookResponse {
  return { ...NO_PROACTIVE_MESSAGE };
}

export function getTriggeredHooks(_params: Required<EngagementSignals>): HookResponse[] {
  return [];
}

export function shouldTriggerHook(_params: Pick<EngagementSignals, "emotion" | "hour" | "daysSinceLastChat">): {
  shouldTrigger: boolean;
  hook: HookResponse;
} {
  return { shouldTrigger: false, hook: { ...NO_PROACTIVE_MESSAGE } };
}
