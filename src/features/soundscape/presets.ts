import type { SoundscapeId, SoundscapePreset } from "./types";

// Original compositions expressed only as notes and synthesis parameters.
// No recordings, samples, copyrighted melodies, or external audio are used.
export const SOUNDSCAPE_PRESETS: Record<SoundscapeId, SoundscapePreset> = {
  glow: {
    id: "glow", title: "晨光", seed: "memoryai-glow-v2", engineVersion: "2", gain: 0.72,
    tonicHz: 130.81, tempoBpm: 58, chordRoots: [0, 9, 5, 7],
    chordVoicings: [[0, 4, 7, 11], [0, 3, 7, 10], [0, 4, 7, 11], [0, 5, 7, 12]],
    melody: [7, null, 11, 12, null, 11, 7, 4, 7, 9, null, 7, 4, null, 2, null],
    melodyGain: 0.052, padGain: 0.027, stereoWidth: 0.38, reverbSeconds: 2.7,
  },
  companion: {
    id: "companion", title: "相伴", seed: "memoryai-companion-v2", engineVersion: "2", gain: 0.68,
    tonicHz: 130.81, tempoBpm: 54, chordRoots: [5, 0, 9, 7],
    chordVoicings: [[0, 4, 7, 11], [0, 4, 7, 11], [0, 3, 7, 10], [0, 5, 7, 10]],
    melody: [4, null, 7, null, 9, 7, 4, null, 2, 4, null, 7, null, 4, 2, null],
    melodyGain: 0.047, padGain: 0.029, stereoWidth: 0.28, reverbSeconds: 2.4,
  },
  stardust: {
    id: "stardust", title: "星河", seed: "memoryai-stardust-v2", engineVersion: "2", gain: 0.64,
    tonicHz: 146.83, tempoBpm: 62, chordRoots: [0, 7, 9, 5],
    chordVoicings: [[0, 4, 7, 11], [0, 4, 7, 9], [0, 3, 7, 10], [0, 4, 7, 11]],
    melody: [12, 11, 7, null, 14, null, 11, 9, 7, null, 4, 7, 9, null, 7, null],
    melodyGain: 0.05, padGain: 0.024, stereoWidth: 0.56, reverbSeconds: 3.6,
  },
  reunion: {
    id: "reunion", title: "重逢", seed: "memoryai-reunion-v2", engineVersion: "2", gain: 0.7,
    tonicHz: 155.56, tempoBpm: 56, chordRoots: [0, 5, 9, 7],
    chordVoicings: [[0, 4, 7, 11], [0, 4, 7, 9], [0, 3, 7, 10], [0, 5, 7, 12]],
    melody: [7, null, 12, 11, 7, null, 4, 5, 7, 9, null, 7, 4, 2, 0, null],
    melodyGain: 0.054, padGain: 0.028, stereoWidth: 0.34, reverbSeconds: 3.1,
  },
};
