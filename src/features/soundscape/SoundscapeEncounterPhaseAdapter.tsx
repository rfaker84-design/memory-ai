"use client";

import { useEffect } from "react";

import type { SoundscapeEncounterPhase } from "./types";

export const SOUNDSCAPE_ENCOUNTER_PHASE_EVENT = "memoryai:soundscape:encounter-phase";

export type SoundscapeEncounterPhaseDetail = Readonly<{ phase: SoundscapeEncounterPhase }>;

export function publishSoundscapeEncounterPhase(phase: SoundscapeEncounterPhase): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent<SoundscapeEncounterPhaseDetail>(SOUNDSCAPE_ENCOUNTER_PHASE_EVENT, { detail: { phase } }));
}

/**
 * This adapter derives its input from the encounter page's existing read-only
 * presentation state. It neither starts media nor mutates the encounter flow.
 */
export function SoundscapeEncounterPhaseAdapter({ phase }: Readonly<{ phase: SoundscapeEncounterPhase }>) {
  useEffect(() => {
    publishSoundscapeEncounterPhase(phase);
    return () => publishSoundscapeEncounterPhase("off");
  }, [phase]);
  return null;
}
