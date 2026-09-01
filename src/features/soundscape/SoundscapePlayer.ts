import { SOUNDSCAPE_IDS, type SoundscapeId } from "./types";

export const SOUNDSCAPE_PLAYER_LABELS: Readonly<Record<SoundscapeId, string>> = {
  glow: "暖光",
  companion: "相伴",
  stardust: "星尘",
  reunion: "重逢",
};

export function adjacentSoundscape(current: SoundscapeId, direction: -1 | 1): SoundscapeId {
  const index = SOUNDSCAPE_IDS.indexOf(current);
  return SOUNDSCAPE_IDS[(index + direction + SOUNDSCAPE_IDS.length) % SOUNDSCAPE_IDS.length];
}
