"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";

import { SoundscapeControl } from "./SoundscapeControl";
import { SoundscapeEngine } from "./SoundscapeEngine";
import { attachSoundscapeEncounterPhaseBridge, attachSoundscapeMediaBridge } from "./SoundscapeMediaBridge";
import { isSoundscapeFeatureEnabled, resolveSoundscapeRoute } from "./SoundscapePolicy";
import { readSoundscapePreference, withSoundscapeEnabled, withSoundscapeVolume, writeSoundscapePreference } from "./SoundscapePreference";
import type { SoundscapeEncounterPhase, SoundscapePreference } from "./types";

// Next.js replaces this value at the production build boundary.
const SOUNDSCAPE_FEATURE_ENABLED = isSoundscapeFeatureEnabled(process.env.NEXT_PUBLIC_SOUNDSCAPE_ENABLED);
type Props = Readonly<{ children: React.ReactNode }>;

export function SoundscapeProvider({ children }: Props) {
  // A disabled build mounts no Web Audio code, DOM control, or media listeners.
  if (!SOUNDSCAPE_FEATURE_ENABLED) return children;
  return <SoundscapeRuntime>{children}</SoundscapeRuntime>;
}

function SoundscapeRuntime({ children }: Props) {
  const pathname = usePathname();
  const [encounterPhase, setEncounterPhase] = useState<SoundscapeEncounterPhase>("off");
  const decision = resolveSoundscapeRoute(pathname, encounterPhase);
  const [preference, setPreference] = useState<SoundscapePreference>(() => (
    typeof window === "undefined" ? { version: 1, enabled: false, volume: 0.22 } : readSoundscapePreference(window.localStorage)
  ));
  const [sessionActivated, setSessionActivated] = useState(false);
  const engineRef = useRef<SoundscapeEngine | null>(null);

  const persist = useCallback((next: SoundscapePreference) => {
    setPreference(next);
    writeSoundscapePreference(window.localStorage, next);
  }, []);

  const begin = useCallback((next: SoundscapePreference) => {
    if (!decision.soundscape) return;
    try {
      const engine = engineRef.current ?? new SoundscapeEngine();
      engineRef.current = engine;
      engine.activate();
      engine.setVolume(next.volume);
      engine.play(decision.soundscape);
      setSessionActivated(true);
    } catch {
      // Sound remains a progressive enhancement and cannot alter product flows.
      engineRef.current?.dispose();
      engineRef.current = null;
      setSessionActivated(false);
    }
  }, [decision.soundscape]);

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

  useEffect(() => {
    if (!sessionActivated) return;
    const engine = engineRef.current;
    if (!engine) return;
    engine.setVolume(preference.volume);
    if (preference.enabled && decision.soundscape) engine.play(decision.soundscape);
    else engine.fadeToStop();
  }, [decision.soundscape, preference.enabled, preference.volume, sessionActivated]);

  useEffect(() => attachSoundscapeEncounterPhaseBridge(document, ({ phase }) => setEncounterPhase(phase)), []);

  useEffect(() => {
    if (!sessionActivated || !preference.enabled || !engineRef.current) return;
    return attachSoundscapeMediaBridge(document, (event) => engineRef.current?.handleMediaEvent(event));
  }, [preference.enabled, sessionActivated]);

  useEffect(() => () => stopAndDispose(), [stopAndDispose]);

  return <>
    {children}
    {decision.soundscape ? <SoundscapeControl preference={preference} awaitingActivation={preference.enabled && !sessionActivated} onPrimaryAction={onPrimaryAction} onVolumeChange={onVolumeChange} /> : null}
  </>;
}
