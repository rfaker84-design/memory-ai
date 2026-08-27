import type { SoundscapeId, SoundscapePreset } from "./types";

// These are synthesis parameters only. They deliberately contain neither audio
// bytes nor external source locations.
export const SOUNDSCAPE_PRESETS: Record<SoundscapeId, SoundscapePreset> = {
  glow: {
    id: "glow", title: "微光", seed: "memoryai-glow-v1", engineVersion: "1", gain: 0.64,
    droneHz: [73.42, 110], noiseGain: 0.019, noiseFilterHz: 1200,
    shimmerHz: [329.63, 466.16], shimmerIntervalMs: [11500, 24600], stereoWidth: 0.42, reverbSeconds: 2.8,
  },
  companion: {
    id: "companion", title: "相伴", seed: "memoryai-companion-v1", engineVersion: "1", gain: 0.58,
    droneHz: [55, 82.41], noiseGain: 0.015, noiseFilterHz: 850,
    shimmerHz: [220, 293.66], shimmerIntervalMs: [14000, 28600], stereoWidth: 0.26, reverbSeconds: 2.3,
  },
  stardust: {
    id: "stardust", title: "星尘", seed: "memoryai-stardust-v1", engineVersion: "1", gain: 0.52,
    droneHz: [65.41, 98], noiseGain: 0.012, noiseFilterHz: 1650,
    shimmerHz: [392, 587.33], shimmerIntervalMs: [8200, 19300], stereoWidth: 0.62, reverbSeconds: 3.7,
  },
  reunion: {
    id: "reunion", title: "重逢", seed: "memoryai-reunion-v1", engineVersion: "1", gain: 0.61,
    droneHz: [61.74, 92.5], noiseGain: 0.016, noiseFilterHz: 1050,
    shimmerHz: [261.63, 392], shimmerIntervalMs: [10000, 22100], stereoWidth: 0.38, reverbSeconds: 3.2,
  },
};
