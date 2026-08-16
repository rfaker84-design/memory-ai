"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import {
  authorizeCompanionMotionPlayback,
  companionMotionPackNeedsPolling,
  CompanionMotionRequestError,
  loadCompanionMotionPack,
  type CompanionMotionPack,
  type CompanionMotionPlayback,
  type CompanionMotionVariant,
} from "./companionMotionClient";
import { resolvePlayableMotionVariant } from "./companionMotionState";
import styles from "./CompanionMotionBackground.module.css";

type PlaybackSource = { jobId: string } & CompanionMotionPlayback;
type PlaybackSources = Partial<Record<CompanionMotionVariant, PlaybackSource>>;

type PlaybackAttempt = {
  requested: boolean;
  status: number | null;
  error: string | null;
};

type VideoObservation = {
  exists: boolean;
  src: boolean;
  readyState: number | null;
  networkState: number | null;
  paused: boolean | null;
  currentTime: number | null;
  duration: number | null;
  error: string | null;
  play: "not-attempted" | "resolved" | "rejected";
  playError: string | null;
  opacity: string | null;
  display: string | null;
  visibility: string | null;
};

type MotionDebugState = {
  attempts: Partial<Record<CompanionMotionVariant, PlaybackAttempt>>;
  videos: Partial<Record<CompanionMotionVariant, VideoObservation>>;
  lastEvent: string | null;
  copied: boolean;
};

type Props = {
  memoryId: string;
  portraitUrl: string;
  variant: CompanionMotionVariant;
  preloadVariant?: CompanionMotionVariant | null;
  onAcknowledgementComplete?: () => void;
  onAcknowledgementUnavailable?: () => void;
  motionEnabled: boolean;
  className?: string;
};

const POLL_INTERVAL_MS = 6_000;
const MAX_POLL_ATTEMPTS = 100;
const CROSSFADE_MS = 900;
const STAGING_DEBUG_HOST = "app.staging.yijianmemory.cn";
const EMPTY_DEBUG_STATE: MotionDebugState = {
  attempts: {},
  videos: {},
  lastEvent: null,
  copied: false,
};

function debugError(error: unknown): string {
  return error instanceof Error ? `${error.name}: ${error.message}` : String(error);
}

export function CompanionMotionBackground({
  memoryId,
  portraitUrl,
  variant,
  preloadVariant = null,
  onAcknowledgementComplete,
  onAcknowledgementUnavailable,
  motionEnabled,
  className,
}: Props) {
  const [debugEnabled, setDebugEnabled] = useState(false);
  const debugEnabledRef = useRef(false);
  const [debugState, setDebugState] = useState<MotionDebugState>(EMPTY_DEBUG_STATE);
  const [pack, setPack] = useState<CompanionMotionPack | null>(null);
  const [sources, setSources] = useState<PlaybackSources>({});
  const [visibleVariant, setVisibleVariant] = useState<CompanionMotionVariant | null>(null);
  const [playbackFailed, setPlaybackFailed] = useState(false);
  const pollAttempts = useRef(0);
  const authorizationFailures = useRef(new Map<string, number>());
  const [authorizationEpoch, setAuthorizationEpoch] = useState(0);
  const authorizedJobs = useRef(new Map<string, CompanionMotionPlayback>());
  const videoNodes = useRef(new Map<CompanionMotionVariant, HTMLVideoElement>());
  const crossfadeTimer = useRef<number | null>(null);
  const authorizationRetryTimer = useRef<number | null>(null);
  const visibleVariantRef = useRef<CompanionMotionVariant | null>(null);
  const acknowledgementUnavailable = useRef(false);
  const acknowledgementCallbacks = useRef({ onAcknowledgementComplete, onAcknowledgementUnavailable });

  useEffect(() => {
    acknowledgementCallbacks.current = { onAcknowledgementComplete, onAcknowledgementUnavailable };
  }, [onAcknowledgementComplete, onAcknowledgementUnavailable]);

  useEffect(() => {
    if (variant !== "acknowledgement") acknowledgementUnavailable.current = false;
  }, [variant]);

  const settleUnavailableAcknowledgement = () => {
    if (variant !== "acknowledgement" || acknowledgementUnavailable.current) return;
    acknowledgementUnavailable.current = true;
    acknowledgementCallbacks.current.onAcknowledgementUnavailable?.();
  };

  useEffect(() => {
    const enabled = window.location.hostname === STAGING_DEBUG_HOST
      && new URLSearchParams(window.location.search).get("motionDebug") === "1";
    debugEnabledRef.current = enabled;
    setDebugEnabled(enabled);
    if (enabled) setDebugState(EMPTY_DEBUG_STATE);
  }, []);

  const observeVideo = (motionVariant: CompanionMotionVariant, event: string) => {
    if (!debugEnabledRef.current) return;
    const video = videoNodes.current.get(motionVariant);
    const style = video ? window.getComputedStyle(video) : null;
    const mediaError = video?.error;
    setDebugState((current) => ({
      ...current,
      lastEvent: `${motionVariant}:${event}`,
      videos: {
        ...current.videos,
        [motionVariant]: {
          exists: Boolean(video),
          src: Boolean(video?.currentSrc || video?.getAttribute("src")),
          readyState: video?.readyState ?? null,
          networkState: video?.networkState ?? null,
          paused: video?.paused ?? null,
          currentTime: video ? Number(video.currentTime.toFixed(3)) : null,
          duration: video && Number.isFinite(video.duration) ? Number(video.duration.toFixed(3)) : null,
          error: mediaError ? `${mediaError.code}:${mediaError.message}` : null,
          play: current.videos[motionVariant]?.play ?? "not-attempted",
          playError: current.videos[motionVariant]?.playError ?? null,
          opacity: style?.opacity ?? null,
          display: style?.display ?? null,
          visibility: style?.visibility ?? null,
        },
      },
    }));
  };

  const recordPlay = (motionVariant: CompanionMotionVariant, result: "resolved" | "rejected", error: string | null) => {
    if (!debugEnabledRef.current) return;
    setDebugState((current) => ({
      ...current,
      videos: {
        ...current.videos,
        [motionVariant]: {
          ...(current.videos[motionVariant] ?? {
            exists: Boolean(videoNodes.current.get(motionVariant)),
            src: Boolean(videoNodes.current.get(motionVariant)?.currentSrc),
            readyState: null,
            networkState: null,
            paused: null,
            currentTime: null,
            duration: null,
            error: null,
            opacity: null,
            display: null,
            visibility: null,
          }),
          play: result,
          playError: error,
        },
      },
    }));
  };

  const fail = (failed: CompanionMotionVariant, jobId: string) => {
    authorizedJobs.current.delete(jobId);
    setSources((current) => {
      const next = { ...current };
      delete next[failed];
      return next;
    });
    if (visibleVariantRef.current === failed) {
      visibleVariantRef.current = null;
      setVisibleVariant(null);
    }
    if (failed === "acknowledgement") {
      settleUnavailableAcknowledgement();
    } else {
      // A failed loop never blocks the conversation; remain on the owned still
      // until a freshly authorized source proves it can actually play.
      setPlaybackFailed(true);
    }
    const failures = (authorizationFailures.current.get(jobId) ?? 0) + 1;
    authorizationFailures.current.set(jobId, failures);
    if (failures <= 3) {
      if (authorizationRetryTimer.current !== null) window.clearTimeout(authorizationRetryTimer.current);
      authorizationRetryTimer.current = window.setTimeout(
        () => setAuthorizationEpoch((current) => current + 1),
        POLL_INTERVAL_MS,
      );
    }
  };

  const startPlayback = (motionVariant: CompanionMotionVariant) => {
    const video = videoNodes.current.get(motionVariant);
    if (!video) return;
    video.muted = true;
    video.defaultMuted = true;
    video.playsInline = true;
    void video.play().then(
      () => recordPlay(motionVariant, "resolved", null),
      (error: unknown) => {
        recordPlay(motionVariant, "rejected", debugError(error));
        const source = sources[motionVariant];
        if (source) fail(motionVariant, source.jobId);
      },
    );
  };

  useEffect(() => {
    if (crossfadeTimer.current !== null) window.clearTimeout(crossfadeTimer.current);
    if (authorizationRetryTimer.current !== null) window.clearTimeout(authorizationRetryTimer.current);
    crossfadeTimer.current = null;
    authorizationRetryTimer.current = null;
    pollAttempts.current = 0;
    authorizationFailures.current.clear();
    authorizedJobs.current.clear();
    visibleVariantRef.current = null;
    if (debugEnabledRef.current) setDebugState(EMPTY_DEBUG_STATE);
    setPack(null);
    setSources({});
    setVisibleVariant(null);
    setPlaybackFailed(false);
    const controller = new AbortController();
    let pollTimer: number | null = null;
    let live = true;

    const schedule = () => {
      if (!live || pollAttempts.current >= MAX_POLL_ATTEMPTS) return;
      pollAttempts.current += 1;
      pollTimer = window.setTimeout(() => void refresh(), POLL_INTERVAL_MS);
    };
    const refresh = async () => {
      try {
        let next = await loadCompanionMotionPack(memoryId, controller.signal);
        if (!live) return;
        setPack(next);
        if (companionMotionPackNeedsPolling(next)) schedule();
      } catch (error) {
        // This enhancement never blocks the portrait, Companion, or Chat.
        if (
          live
          && (!(error instanceof CompanionMotionRequestError) || error.status === 408 || error.status >= 500)
        ) schedule();
      }
    };

    void refresh();
    return () => {
      live = false;
      controller.abort();
      if (pollTimer !== null) window.clearTimeout(pollTimer);
      if (authorizationRetryTimer.current !== null) {
        window.clearTimeout(authorizationRetryTimer.current);
        authorizationRetryTimer.current = null;
      }
    };
  }, [memoryId]);

  useEffect(() => {
    if (!pack || !motionEnabled) return;
    const controller = new AbortController();
    let live = true;
    const refreshBefore = Date.now() + 60_000;
    // The first visible frame always comes from idle. Later states are warmed
    // only as the conversation makes them relevant, never on every keystroke.
    const requestedVariants = sources.idle
      ? [...new Set([variant, preloadVariant].filter((candidate): candidate is CompanionMotionVariant => Boolean(candidate)))]
      : ["idle" as const];
    const authorize = async (requestedVariant: CompanionMotionVariant) => {
      const slot = pack.slots.find((candidate) => candidate.variant === requestedVariant && candidate.artifactAvailable);
      if (!slot) {
        if (requestedVariant === "acknowledgement") settleUnavailableAcknowledgement();
        return;
      }
      const current = sources[requestedVariant];
      if (current && Date.parse(current.expiresAt) > refreshBefore) return;
      const jobId = slot.jobId;
      try {
        if (debugEnabledRef.current) {
          setDebugState((current) => ({
            ...current,
            attempts: { ...current.attempts, [slot.variant]: { requested: true, status: null, error: null } },
          }));
        }
        const playback = await authorizeCompanionMotionPlayback(memoryId, jobId, controller.signal);
        if (!live) return;
        if (debugEnabledRef.current) {
          setDebugState((current) => ({
            ...current,
            attempts: { ...current.attempts, [slot.variant]: { requested: true, status: 200, error: null } },
          }));
        }
        authorizedJobs.current.set(jobId, playback);
        authorizationFailures.current.delete(jobId);
        setSources((current) => ({ ...current, [slot.variant]: { jobId, ...playback } }));
        setPlaybackFailed(false);
      } catch (error) {
        if (!live) return;
        if (requestedVariant === "acknowledgement") settleUnavailableAcknowledgement();
        if (debugEnabledRef.current) {
          setDebugState((current) => ({
            ...current,
            attempts: {
              ...current.attempts,
              [slot.variant]: {
                requested: true,
                status: error instanceof CompanionMotionRequestError ? error.status : null,
                error: debugError(error),
              },
            },
          }));
        }
        const failures = (authorizationFailures.current.get(jobId) ?? 0) + 1;
        authorizationFailures.current.set(jobId, failures);
        if (failures <= 3) {
          if (authorizationRetryTimer.current !== null) window.clearTimeout(authorizationRetryTimer.current);
          authorizationRetryTimer.current = window.setTimeout(() => {
            if (live) setAuthorizationEpoch((current) => current + 1);
          }, POLL_INTERVAL_MS);
        }
      }
    };
    for (const requestedVariant of requestedVariants) void authorize(requestedVariant);
    return () => {
      live = false;
      controller.abort();
      if (authorizationRetryTimer.current !== null) {
        window.clearTimeout(authorizationRetryTimer.current);
        authorizationRetryTimer.current = null;
      }
    };
  }, [authorizationEpoch, memoryId, motionEnabled, pack, preloadVariant, sources, variant]);

  const available = useMemo(
    () => new Set(Object.keys(sources) as CompanionMotionVariant[]),
    [sources],
  );
  const targetVariant = motionEnabled
    && !playbackFailed
    ? resolvePlayableMotionVariant(variant, available)
    : null;

  useEffect(() => {
    if (crossfadeTimer.current !== null) window.clearTimeout(crossfadeTimer.current);
    if (!targetVariant) {
      for (const video of videoNodes.current.values()) video.pause();
      visibleVariantRef.current = null;
      setVisibleVariant(null);
      return;
    }
    const target = videoNodes.current.get(targetVariant);
    if (!target) return;
    if (visibleVariantRef.current !== targetVariant && target.readyState > HTMLMediaElement.HAVE_NOTHING) target.currentTime = 0;
    startPlayback(targetVariant);
  }, [targetVariant]);

  useEffect(() => () => {
    if (crossfadeTimer.current !== null) window.clearTimeout(crossfadeTimer.current);
    if (authorizationRetryTimer.current !== null) window.clearTimeout(authorizationRetryTimer.current);
    crossfadeTimer.current = null;
    authorizationRetryTimer.current = null;
    for (const video of videoNodes.current.values()) video.pause();
    videoNodes.current.clear();
  }, []);

  const show = (next: CompanionMotionVariant) => {
    if (next !== targetVariant) return;
    const previous = visibleVariantRef.current;
    visibleVariantRef.current = next;
    setVisibleVariant(next);
    if (previous && previous !== next) {
      if (crossfadeTimer.current !== null) window.clearTimeout(crossfadeTimer.current);
      crossfadeTimer.current = window.setTimeout(() => {
        videoNodes.current.get(previous)?.pause();
      }, CROSSFADE_MS);
    }
  };

  const warm = (next: CompanionMotionVariant) => {
    if (next !== targetVariant) return;
    const video = videoNodes.current.get(next);
    if (!video) return;
    startPlayback(next);
  };

  const showAfterFirstMovingFrame = (next: CompanionMotionVariant) => {
    const video = videoNodes.current.get(next);
    if (!video || video.currentTime <= 0) return;
    show(next);
  };

  const copyDebugResult = async () => {
    const slotLines = ["idle", "attentive", "acknowledgement", "reflective"].map((candidate) => {
      const motionVariant = candidate as CompanionMotionVariant;
      const slot = pack?.slots.find((entry) => entry.variant === motionVariant);
      const request = debugState.attempts[motionVariant];
      const video = debugState.videos[motionVariant];
      return [
        motionVariant,
        `approved=${slot?.artifactAvailable === true}`,
        `status=${slot?.status ?? "missing"}`,
        `playbackRequested=${request?.requested === true}`,
        `playbackHttp=${request?.status ?? "n/a"}`,
        `playbackError=${request?.error ?? "none"}`,
        `videoExists=${video?.exists ?? false}`,
        `src=${video?.src ?? false}`,
        `readyState=${video?.readyState ?? "n/a"}`,
        `networkState=${video?.networkState ?? "n/a"}`,
        `paused=${video?.paused ?? "n/a"}`,
        `currentTime=${video?.currentTime ?? "n/a"}`,
        `duration=${video?.duration ?? "n/a"}`,
        `videoError=${video?.error ?? "none"}`,
        `play=${video?.play ?? "not-attempted"}`,
        `playError=${video?.playError ?? "none"}`,
        `opacity=${video?.opacity ?? "n/a"}`,
        `display=${video?.display ?? "n/a"}`,
        `visibility=${video?.visibility ?? "n/a"}`,
      ].join(" ");
    });
    const payload = [
      `memoryId=${memoryId}`,
      `eligible=${pack?.eligible ?? false}`,
      `target=${targetVariant ?? "still"}`,
      `visible=${visibleVariant ?? "still"}`,
      `staticFallback=${visibleVariant === null}`,
      `lastEvent=${debugState.lastEvent ?? "none"}`,
      ...slotLines,
    ].join("\n");
    try {
      await navigator.clipboard.writeText(payload);
      setDebugState((current) => ({ ...current, copied: true }));
    } catch {
      setDebugState((current) => ({ ...current, copied: false }));
    }
  };

  return (
    <div
      className={`${styles.root}${className ? ` ${className}` : ""}`}
      data-motion-enabled={motionEnabled ? "true" : "false"}
      data-motion-target={targetVariant ?? "still"}
      data-motion-visible={visibleVariant ?? "still"}
      aria-hidden="true"
    >
      <img
        className={styles.still}
        data-motion-still="true"
        src={portraitUrl}
        alt=""
      />
      {motionEnabled && Object.entries(sources).map(([key, source]) => {
        const motionVariant = key as CompanionMotionVariant;
        if (!source) return null;
        return (
          <video
            key={`${source.jobId}:${source.url}`}
            ref={(node) => {
              if (node) videoNodes.current.set(motionVariant, node);
              else videoNodes.current.delete(motionVariant);
            }}
            className={styles.video}
            data-motion-video={motionVariant}
            data-visible={visibleVariant === motionVariant ? "true" : "false"}
            src={source.url}
            autoPlay={motionVariant !== "acknowledgement" && motionVariant === targetVariant}
            muted
            loop={motionVariant !== "acknowledgement"}
            playsInline
            preload={motionVariant === targetVariant ? "auto" : "none"}
            onLoadStart={() => observeVideo(motionVariant, "loadstart")}
            onLoadedMetadata={() => observeVideo(motionVariant, "loadedmetadata")}
            onLoadedData={() => { observeVideo(motionVariant, "loadeddata"); warm(motionVariant); }}
            onCanPlay={() => observeVideo(motionVariant, "canplay")}
            onPlaying={() => {
              setPlaybackFailed(false);
              observeVideo(motionVariant, "playing");
            }}
            onWaiting={() => observeVideo(motionVariant, "waiting")}
            onStalled={() => observeVideo(motionVariant, "stalled")}
            onPause={() => observeVideo(motionVariant, "pause")}
            onEnded={() => {
              observeVideo(motionVariant, "ended");
              if (motionVariant === "acknowledgement") acknowledgementCallbacks.current.onAcknowledgementComplete?.();
            }}
            onTimeUpdate={() => { observeVideo(motionVariant, "timeupdate"); showAfterFirstMovingFrame(motionVariant); }}
            onError={() => { observeVideo(motionVariant, "error"); fail(motionVariant, source.jobId); }}
          />
        );
      })}
      {debugEnabled && (
        <aside className={styles.debugPanel} aria-label="微动态诊断">
          <strong>微动态诊断 · Staging</strong>
          <dl>
            <div><dt>memory</dt><dd>{memoryId}</dd></div>
            <div><dt>approved pack</dt><dd>{pack?.eligible ? "found" : "not found"}</dd></div>
            <div><dt>target / visible</dt><dd>{targetVariant ?? "still"} / {visibleVariant ?? "still"}</dd></div>
            <div><dt>static fallback</dt><dd>{visibleVariant === null ? "shown" : "hidden"}</dd></div>
            <div><dt>last media event</dt><dd>{debugState.lastEvent ?? "none"}</dd></div>
          </dl>
          {(["idle", "attentive", "acknowledgement", "reflective"] as CompanionMotionVariant[]).map((motionVariant) => {
            const slot = pack?.slots.find((entry) => entry.variant === motionVariant);
            const request = debugState.attempts[motionVariant];
            const video = debugState.videos[motionVariant];
            return (
              <section key={motionVariant} className={styles.debugVariant}>
                <strong>{motionVariant}</strong>
                <span>artifact: {slot?.artifactAvailable === true ? "approved" : "missing"} · {slot?.status ?? "no-slot"}</span>
                <span>playback: {request?.requested ? `requested ${request.status ?? "pending"}` : "not requested"}{request?.error ? ` · ${request.error}` : ""}</span>
                <span>video: {video?.exists ? "present" : "absent"} · src {video?.src ? "set" : "none"}</span>
                <span>ready {video?.readyState ?? "n/a"} · network {video?.networkState ?? "n/a"} · paused {String(video?.paused ?? "n/a")}</span>
                <span>time {video?.currentTime ?? "n/a"} / {video?.duration ?? "n/a"} · play {video?.play ?? "not-attempted"}</span>
                <span>error {video?.error ?? video?.playError ?? "none"}</span>
                <span>style opacity {video?.opacity ?? "n/a"} · {video?.display ?? "n/a"} · {video?.visibility ?? "n/a"}</span>
              </section>
            );
          })}
          <button type="button" onClick={() => void copyDebugResult()}>{debugState.copied ? "已复制" : "复制诊断结果"}</button>
        </aside>
      )}
    </div>
  );
}
