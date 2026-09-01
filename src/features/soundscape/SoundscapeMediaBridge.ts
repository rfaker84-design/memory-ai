import type { ForegroundAudioKind, SoundscapeMediaEvent } from "./types";

import { SOUNDSCAPE_ENCOUNTER_PHASE_EVENT, type SoundscapeEncounterPhaseDetail } from "./SoundscapeEncounterPhaseAdapter";

type MediaDocument = Pick<Document, "addEventListener" | "removeEventListener" | "visibilityState"> &
  Partial<Pick<Document, "querySelectorAll">>;
type ForegroundAudioDetail = Readonly<{ token: string; type: ForegroundAudioKind; active: boolean }>;

export const SOUNDSCAPE_FOREGROUND_AUDIO_EVENT = "memoryai:soundscape:foreground-audio";

let foregroundToken = 0;

function mediaElementFromEvent(event: Event): HTMLMediaElement | null {
  return event.target instanceof HTMLMediaElement ? event.target : null;
}

function mediaType(media: HTMLMediaElement): "video" | "audio" {
  return media instanceof HTMLVideoElement ? "video" : "audio";
}

function isPriorityMedia(media: HTMLMediaElement): boolean {
  if (media instanceof HTMLAudioElement) return true;
  return media.dataset.soundscapePriority === "true" || (!media.muted && media.volume > 0);
}

function isPlaying(media: HTMLMediaElement): boolean {
  return !media.paused && !media.ended;
}

function eventDetail(event: Event): ForegroundAudioDetail | null {
  const detail = (event as CustomEvent<unknown>).detail;
  if (!detail || typeof detail !== "object") return null;
  const candidate = detail as Partial<ForegroundAudioDetail>;
  if (typeof candidate.token !== "string" || typeof candidate.active !== "boolean" || !["video", "audio", "tts", "system_voice"].includes(String(candidate.type))) return null;
  return candidate as ForegroundAudioDetail;
}

/** Reference-counted, idempotent contract for non-HTML foreground audio. */
export function beginForegroundAudio(type: ForegroundAudioKind): () => void {
  if (typeof window === "undefined") return () => undefined;
  const token = `soundscape-foreground-${++foregroundToken}`;
  window.dispatchEvent(new CustomEvent<ForegroundAudioDetail>(SOUNDSCAPE_FOREGROUND_AUDIO_EVENT, { detail: { token, type, active: true } }));
  let ended = false;
  return () => {
    if (ended) return;
    ended = true;
    window.dispatchEvent(new CustomEvent<ForegroundAudioDetail>(SOUNDSCAPE_FOREGROUND_AUDIO_EVENT, { detail: { token, type, active: false } }));
  };
}

/** Observes browser-native media lifecycle events without changing media state. */
export function attachSoundscapeMediaBridge(documentRef: MediaDocument, notify: (event: SoundscapeMediaEvent) => void): () => void {
  const activeMedia = new Map<ForegroundAudioKind, Set<HTMLMediaElement>>();
  const activeForeground = new Map<ForegroundAudioKind, Set<string>>();
  const setForMedia = (type: ForegroundAudioKind) => activeMedia.get(type) ?? new Set<HTMLMediaElement>();
  const setForForeground = (type: ForegroundAudioKind) => activeForeground.get(type) ?? new Set<string>();
  const beginMedia = (type: "video" | "audio", media: HTMLMediaElement) => {
    const active = setForMedia(type);
    if (active.has(media)) return;
    active.add(media);
    activeMedia.set(type, active);
    if (active.size === 1) notify({ type, active: true });
  };
  const endMedia = (type: "video" | "audio", media: HTMLMediaElement) => {
    const active = activeMedia.get(type);
    if (!active || !active.delete(media) || active.size > 0) return;
    notify({ type, active: false });
  };
  const finish = (event: Event) => {
    const media = mediaElementFromEvent(event);
    if (media) endMedia(mediaType(media), media);
  };
  const sync = (media: HTMLMediaElement) => {
    const type = mediaType(media);
    if (isPlaying(media) && isPriorityMedia(media)) beginMedia(type, media);
    else endMedia(type, media);
  };
  const start = (event: Event) => {
    const media = mediaElementFromEvent(event);
    if (media) sync(media);
  };
  const volume = (event: Event) => {
    const media = mediaElementFromEvent(event);
    if (media) sync(media);
  };
  const foreground = (event: Event) => {
    const detail = eventDetail(event);
    if (!detail) return;
    const active = setForForeground(detail.type);
    if (detail.active) {
      if (active.has(detail.token)) return;
      active.add(detail.token);
      activeForeground.set(detail.type, active);
      if (active.size === 1) notify({ type: detail.type, active: true });
      return;
    }
    if (!active.delete(detail.token) || active.size > 0) return;
    notify({ type: detail.type, active: false });
  };
  const visibility = () => notify({ type: "visibility", visible: documentRef.visibilityState !== "hidden" });
  documentRef.addEventListener("play", start, true);
  documentRef.addEventListener("playing", start, true);
  documentRef.addEventListener("pause", finish, true);
  documentRef.addEventListener("ended", finish, true);
  documentRef.addEventListener("volumechange", volume, true);
  documentRef.addEventListener(SOUNDSCAPE_FOREGROUND_AUDIO_EVENT, foreground as EventListener);
  documentRef.addEventListener("visibilitychange", visibility);
  documentRef.querySelectorAll?.("audio, video").forEach((media) => sync(media as HTMLMediaElement));
  return () => {
    documentRef.removeEventListener("play", start, true);
    documentRef.removeEventListener("playing", start, true);
    documentRef.removeEventListener("pause", finish, true);
    documentRef.removeEventListener("ended", finish, true);
    documentRef.removeEventListener("volumechange", volume, true);
    documentRef.removeEventListener(SOUNDSCAPE_FOREGROUND_AUDIO_EVENT, foreground as EventListener);
    documentRef.removeEventListener("visibilitychange", visibility);
  };
}

export function attachSoundscapeEncounterPhaseBridge(
  documentRef: Pick<Document, "addEventListener" | "removeEventListener">,
  notify: (detail: SoundscapeEncounterPhaseDetail) => void,
): () => void {
  const listener = (event: Event) => {
    const detail = (event as CustomEvent<unknown>).detail;
    if (!detail || typeof detail !== "object" || !["off", "preparing", "settling"].includes(String((detail as { phase?: unknown }).phase))) return;
    notify(detail as SoundscapeEncounterPhaseDetail);
  };
  documentRef.addEventListener(SOUNDSCAPE_ENCOUNTER_PHASE_EVENT, listener as EventListener);
  return () => documentRef.removeEventListener(SOUNDSCAPE_ENCOUNTER_PHASE_EVENT, listener as EventListener);
}
