export const SOUNDSCAPE_IDS = ["glow", "companion", "stardust", "reunion"] as const;

export type SoundscapeId = typeof SOUNDSCAPE_IDS[number];

export type SoundscapePreset = {
  id: SoundscapeId;
  title: string;
  seed: string;
  engineVersion: "1";
  gain: number;
  droneHz: readonly [number, number];
  noiseGain: number;
  noiseFilterHz: number;
  shimmerHz: readonly [number, number];
  shimmerIntervalMs: readonly [number, number];
  stereoWidth: number;
  reverbSeconds: number;
};

export type SoundscapeRouteDecision = {
  soundscape: SoundscapeId | null;
  reason: "home" | "companion" | "memories" | "encounter" | "off-route";
};

/** Encounter is silent by default; these phase values are presentation-only. */
export type SoundscapeEncounterPhase = "off" | "preparing" | "settling";

export type SoundscapePreference = {
  version: 1;
  enabled: boolean;
  volume: number;
};

export type ForegroundAudioKind = "video" | "audio" | "tts" | "system_voice";

export type SoundscapeMediaEvent =
  | { type: ForegroundAudioKind; active: boolean }
  | { type: "visibility"; visible: boolean };
