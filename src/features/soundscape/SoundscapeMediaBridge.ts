import type { SoundscapeMediaEvent } from "./types";

type MediaDocument = Pick<Document, "addEventListener" | "removeEventListener" | "visibilityState">;

function mediaElementFromEvent(event: Event): HTMLMediaElement | null {
  return event.target instanceof HTMLMediaElement ? event.target : null;
}

/** Reads browser-native media lifecycle events without altering existing media state. */
export function attachSoundscapeMediaBridge(documentRef: MediaDocument, notify: (event: SoundscapeMediaEvent) => void): () => void {
  const activeVideos = new Set<HTMLMediaElement>();
  const activeVoices = new Set<HTMLMediaElement>();
  const start = (event: Event) => {
    const media = mediaElementFromEvent(event);
    if (!media) return;
    const active = media instanceof HTMLVideoElement ? activeVideos : activeVoices;
    if (active.has(media)) return;
    active.add(media);
    notify({ type: media instanceof HTMLVideoElement ? "video" : "voice", active: true });
  };
  const finish = (event: Event) => {
    const media = mediaElementFromEvent(event);
    if (!media) return;
    const active = media instanceof HTMLVideoElement ? activeVideos : activeVoices;
    if (!active.delete(media) || active.size > 0) return;
    notify({ type: media instanceof HTMLVideoElement ? "video" : "voice", active: false });
  };
  const visibility = () => notify({ type: "visibility", visible: documentRef.visibilityState !== "hidden" });
  documentRef.addEventListener("play", start, true);
  documentRef.addEventListener("playing", start, true);
  documentRef.addEventListener("pause", finish, true);
  documentRef.addEventListener("ended", finish, true);
  documentRef.addEventListener("visibilitychange", visibility);
  return () => {
    documentRef.removeEventListener("play", start, true);
    documentRef.removeEventListener("playing", start, true);
    documentRef.removeEventListener("pause", finish, true);
    documentRef.removeEventListener("ended", finish, true);
    documentRef.removeEventListener("visibilitychange", visibility);
  };
}
