/**
 * Historical behavioural-emotion compatibility surface.
 *
 * Mouse movement, idle time, return frequency and text keywords are not a
 * consented source of emotional inference.  The production product therefore
 * keeps a neutral, inert surface rather than adapting persona, visual effects,
 * or outreach to those signals.
 */

export type UserEmotion = "calm" | "lonely" | "nostalgic" | "emotional" | "warm";

export interface UserSignals {
  idleSeconds: number;
  mouseSpeed: number;
  clickFrequency: number;
  sessionDuration: number;
  returnCount: number;
  interactionCount: number;
  averageInteractionGap: number;
  emotionalKeywords: number;
  recentRapidClicks: boolean;
}

export interface AIBehaviorModifier {
  responseSpeed: number;
  movementApproach: number;
  speechFrequency: number;
  glowIntensity: number;
  voiceTone: string;
}

export interface UniverseModifier {
  fogDensityMul: number;
  starBrightnessMul: number;
  ambientWarmth: number;
  cameraSpeedMul: number;
  particleBoost: number;
  bloomMul: number;
}

const NEUTRAL_BEHAVIOUR: AIBehaviorModifier = {
  responseSpeed: 1,
  movementApproach: 0,
  speechFrequency: 0,
  glowIntensity: 1,
  voiceTone: "neutral",
};

const NEUTRAL_UNIVERSE: UniverseModifier = {
  fogDensityMul: 1,
  starBrightnessMul: 1,
  ambientWarmth: 1,
  cameraSpeedMul: 1,
  particleBoost: 0,
  bloomMul: 1,
};

const ZERO_SIGNALS: UserSignals = {
  idleSeconds: 0,
  mouseSpeed: 0,
  clickFrequency: 0,
  sessionDuration: 0,
  returnCount: 0,
  interactionCount: 0,
  averageInteractionGap: 0,
  emotionalKeywords: 0,
  recentRapidClicks: false,
};

export const AI_BEHAVIOR: Record<UserEmotion, AIBehaviorModifier> = {
  calm: NEUTRAL_BEHAVIOUR,
  lonely: NEUTRAL_BEHAVIOUR,
  nostalgic: NEUTRAL_BEHAVIOUR,
  emotional: NEUTRAL_BEHAVIOUR,
  warm: NEUTRAL_BEHAVIOUR,
};

export const UNIVERSE_MOD: Record<UserEmotion, UniverseModifier> = {
  calm: NEUTRAL_UNIVERSE,
  lonely: NEUTRAL_UNIVERSE,
  nostalgic: NEUTRAL_UNIVERSE,
  emotional: NEUTRAL_UNIVERSE,
  warm: NEUTRAL_UNIVERSE,
};

export const USER_EMOTION_SPEECH: Record<UserEmotion, string[]> = {
  calm: [],
  lonely: [],
  nostalgic: [],
  emotional: [],
  warm: [],
};

export function onUserEmotionChange(_fn: (emotion: UserEmotion, previous: UserEmotion) => void): () => void {
  return () => undefined;
}

export function getUserEmotion(): UserEmotion { return "calm"; }
export function getUserSignals(): Readonly<UserSignals> { return { ...ZERO_SIGNALS }; }
export function getAIBehaviorMod(): AIBehaviorModifier { return { ...NEUTRAL_BEHAVIOUR }; }
export function getUniverseMod(): UniverseModifier { return { ...NEUTRAL_UNIVERSE }; }
export function getUserEmotionConfidence(): number { return 0; }
export function pickUserEmotionSpeech(): string { return ""; }
export function tickUserEmotion(_delta: number): void {}
export function recordMouseMove(_x: number, _y: number, _timestamp: number): void {}
export function recordClick(): void {}
export function recordInteraction(): void {}
export function recordReturn(): void {}
export function analyzeInputEmotion(_text: string): number { return 0; }
export function resetStabilityTimer(): void {}
