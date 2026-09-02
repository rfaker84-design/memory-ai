import type { SoundscapeId, SoundscapePreset } from "./types";

// Synthesis parameters only: no audio bytes or external locations are used.
export const SOUNDSCAPE_PRESETS: Record<SoundscapeId, SoundscapePreset> = {
  glow: {
    id: "glow", title: "微光", seed: "memoryai-glow-v1", engineVersion: "1", gain: 0.64,
    droneHz: [146.83, 220], noiseGain: 0.032, noiseFilterHz: 1500,
    shimmerHz: [329.63, 466.16], shimmerIntervalMs: [11500, 24600], stereoWidth: 0.42, reverbSeconds: 2.8,
  },
  companion: {
    id: "companion", title: "相伴", seed: "memoryai-companion-v1", engineVersion: "1", gain: 0.58,
    droneHz: [130.81, 196], noiseGain: 0.028, noiseFilterHz: 1150,
    shimmerHz: [220, 293.66], shimmerIntervalMs: [14000, 28600], stereoWidth: 0.26, reverbSeconds: 2.3,
  },
  stardust: {
    id: "stardust", title: "星尘", seed: "memoryai-stardust-v1", engineVersion: "1", gain: 0.52,
    droneHz: [164.81, 246.94], noiseGain: 0.025, noiseFilterHz: 1850,
    shimmerHz: [392, 587.33], shimmerIntervalMs: [8200, 19300], stereoWidth: 0.62, reverbSeconds: 3.7,
  },
  reunion: {
    id: "reunion", title: "重逢", seed: "memoryai-reunion-v1", engineVersion: "1", gain: 0.61,
    droneHz: [155.56, 233.08], noiseGain: 0.03, noiseFilterHz: 1350,
    shimmerHz: [261.63, 392], shimmerIntervalMs: [10000, 22100], stereoWidth: 0.38, reverbSeconds: 3.2,
  },
};
