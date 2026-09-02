"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";

import { SoundscapeControl } from "./SoundscapeControl";
import { SoundscapeEngine } from "./SoundscapeEngine";
import { attachSoundscapeEncounterPhaseBridge, attachSoundscapeMediaBridge } from "./SoundscapeMediaBridge";
import { adjacentSoundscape } from "./SoundscapePlayer";
import { isSoundscapeFeatureEnabled, resolveSoundscapeRoute } from "./SoundscapePolicy";
import { DEFAULT_SOUNDSCAPE_PREFERENCE, readSoundscapePreference, withSoundscapeEnabled, withSoundscapeVolume, writeSoundscapePreference } from "./SoundscapePreference";
import type { SoundscapeEncounterPhase, SoundscapeId, SoundscapePreference } from "./types";

// Next.js replaces this value at the production build boundary.
const SOUNDSCAPE_FEATURE_ENABLED = isSoundscapeFeatureEnabled(process.env.NEXT_PUBLIC_SOUNDSCAPE_ENABLED);
type Props = Readonly<{ children: React.ReactNode }>;
const SOUNDSCAPE_PRODUCT_PAUSED = true;

export function SoundscapeProvider({ children }: Props) {
  // A disabled build mounts no Web Audio code, DOM control, or media listeners.
  if (!SOUNDSCAPE_FEATURE_ENABLED) return children;
  return <SoundscapeRuntime paused={SOUNDSCAPE_PRODUCT_PAUSED}>{children}</SoundscapeRuntime>;
}

function SoundscapeRuntime({ children, paused }: Props & Readonly<{ paused: boolean }>) {
  const pathname = usePathname();
  const [encounterPhase, setEncounterPhase] = useState<SoundscapeEncounterPhase>("off");
  const decision = resolveSoundscapeRoute(pathname, encounterPhase);
  // Keep the server render and first browser render identical. The persisted
  // preference is intentionally restored only after hydration and never starts
  // an AudioContext without a fresh user gesture.
  const [preference, setPreference] = useState<SoundscapePreference>(() => ({ ...DEFAULT_SOUNDSCAPE_PREFERENCE }));
  const [hydrated, setHydrated] = useState(false);
  const [sessionActivated, setSessionActivated] = useState(false);
  const [selectedSoundscape, setSelectedSoundscape] = useState<SoundscapeId | null>(decision.soundscape);
  const engineRef = useRef<SoundscapeEngine | null>(null);
  const activeSoundscape = selectedSoundscape ?? decision.soundscape;

  useEffect(() => {
    setPreference(readSoundscapePreference(window.localStorage));
    setHydrated(true);
  }, []);

  const persist = useCallback((next: SoundscapePreference) => {
    setPreference(next);
    writeSoundscapePreference(window.localStorage, next);
  }, []);

  const begin = useCallback((next: SoundscapePreference) => {
    if (!activeSoundscape) return;
    try {
      const engine = engineRef.current ?? new SoundscapeEngine();
      engineRef.current = engine;
      engine.activate();
      engine.setVolume(next.volume);
      engine.play(activeSoundscape);
      setSessionActivated(true);
    } catch {
      // Sound remains a progressive enhancement and cannot alter product flows.
      engineRef.current?.dispose();
      engineRef.current = null;
      setSessionActivated(false);
    }
  }, [activeSoundscape]);

  const stopAndDispose = useCallback(() => {
    engineRef.current?.dispose();
    engineRef.current = null;
    setSessionActivated(false);
  }, []);

  const onPrimaryAction = useCallback(() => {
    if (preference.enabled && !sessionActivated) {
      begin(preference);
      return;
    }
    if (preference.enabled) {
      stopAndDispose();
      persist(withSoundscapeEnabled(preference, false));
      return;
    }
    const next = withSoundscapeEnabled(preference, true);
    persist(next);
    begin(next);
  }, [begin, persist, preference, sessionActivated, stopAndDispose]);

  const onVolumeChange = useCallback((volume: number) => {
    const next = withSoundscapeVolume(preference, volume);
    persist(next);
    if (next.enabled && !sessionActivated) begin(next);
    else engineRef.current?.setVolume(next.volume);
  }, [begin, persist, preference, sessionActivated]);

  const selectAdjacentSoundscape = useCallback((direction: -1 | 1) => {
    if (!activeSoundscape) return;
    setSelectedSoundscape(adjacentSoundscape(activeSoundscape, direction));
  }, [activeSoundscape]);

  useEffect(() => {
    setSelectedSoundscape(decision.soundscape);
  }, [decision.soundscape]);

  useEffect(() => {
    if (!sessionActivated) return;
    const engine = engineRef.current;
    if (!engine) return;
    engine.setVolume(preference.volume);
    if (preference.enabled && activeSoundscape) engine.play(activeSoundscape);
    else engine.fadeToStop();
  }, [activeSoundscape, preference.enabled, preference.volume, sessionActivated]);

  useEffect(() => attachSoundscapeEncounterPhaseBridge(document, ({ phase }) => setEncounterPhase(phase)), []);

  useEffect(() => {
    if (!sessionActivated || !preference.enabled || !engineRef.current) return;
    return attachSoundscapeMediaBridge(document, (event) => engineRef.current?.handleMediaEvent(event));
  }, [preference.enabled, sessionActivated]);

  useEffect(() => () => stopAndDispose(), [stopAndDispose]);

  return <>
    {children}
    {!paused && hydrated && activeSoundscape ? (
      <SoundscapeControl
        preference={preference}
        soundscape={activeSoundscape}
        awaitingActivation={preference.enabled && !sessionActivated}
        playing={preference.enabled && sessionActivated}
        onPrimaryAction={onPrimaryAction}
        onPrevious={() => selectAdjacentSoundscape(-1)}
        onNext={() => selectAdjacentSoundscape(1)}
        onVolumeChange={onVolumeChange}
      />
    ) : null}
  </>;
}

