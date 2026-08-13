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

type Props = {
  memoryId: string;
  portraitUrl: string;
  variant: CompanionMotionVariant;
  motionEnabled: boolean;
  className?: string;
};

const POLL_INTERVAL_MS = 6_000;
const MAX_POLL_ATTEMPTS = 100;
const CROSSFADE_MS = 900;

export function CompanionMotionBackground({
  memoryId,
  portraitUrl,
  variant,
  motionEnabled,
  className,
}: Props) {
  const [pack, setPack] = useState<CompanionMotionPack | null>(null);
  const [sources, setSources] = useState<PlaybackSources>({});
  const [visibleVariant, setVisibleVariant] = useState<CompanionMotionVariant | null>(null);
  const pollAttempts = useRef(0);
  const authorizationFailures = useRef(new Map<string, number>());
  const [authorizationEpoch, setAuthorizationEpoch] = useState(0);
  const authorizedJobs = useRef(new Map<string, CompanionMotionPlayback>());
  const videoNodes = useRef(new Map<CompanionMotionVariant, HTMLVideoElement>());
  const crossfadeTimer = useRef<number | null>(null);
  const authorizationRetryTimer = useRef<number | null>(null);
  const visibleVariantRef = useRef<CompanionMotionVariant | null>(null);

  useEffect(() => {
    if (crossfadeTimer.current !== null) window.clearTimeout(crossfadeTimer.current);
    if (authorizationRetryTimer.current !== null) window.clearTimeout(authorizationRetryTimer.current);
    crossfadeTimer.current = null;
    authorizationRetryTimer.current = null;
    pollAttempts.current = 0;
    authorizationFailures.current.clear();
    authorizedJobs.current.clear();
    visibleVariantRef.current = null;
    setPack(null);
    setSources({});
    setVisibleVariant(null);
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
    // Idle is the only startup authorization. The other two videos are loaded
    // only when their chat state is requested, while idle stays visible.
    const requestedVariant: CompanionMotionVariant = sources.idle ? variant : "idle";
    const slot = pack.slots.find((candidate) => candidate.variant === requestedVariant && candidate.artifactAvailable);
    if (!slot) return;
    const current = sources[requestedVariant];
    if (current && Date.parse(current.expiresAt) > refreshBefore) return;
    const jobId = slot.jobId;
    void (async () => {
      try {
        const playback = await authorizeCompanionMotionPlayback(memoryId, jobId, controller.signal);
        if (!live) return;
        authorizedJobs.current.set(jobId, playback);
        authorizationFailures.current.delete(jobId);
        setSources((current) => ({ ...current, [slot.variant]: { jobId, ...playback } }));
      } catch {
        // A failed authorization leaves the owner photo visible.
        if (!live) return;
        const failures = (authorizationFailures.current.get(jobId) ?? 0) + 1;
        authorizationFailures.current.set(jobId, failures);
        if (failures <= 3) {
          if (authorizationRetryTimer.current !== null) window.clearTimeout(authorizationRetryTimer.current);
          authorizationRetryTimer.current = window.setTimeout(() => {
            if (live) setAuthorizationEpoch((current) => current + 1);
          }, POLL_INTERVAL_MS);
        }
      }
    })();
    return () => {
      live = false;
      controller.abort();
      if (authorizationRetryTimer.current !== null) {
        window.clearTimeout(authorizationRetryTimer.current);
        authorizationRetryTimer.current = null;
      }
    };
  }, [authorizationEpoch, memoryId, motionEnabled, pack, sources.idle, sources[variant], variant]);

  const available = useMemo(
    () => new Set(Object.keys(sources) as CompanionMotionVariant[]),
    [sources],
  );
  const targetVariant = motionEnabled
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
    target.muted = true;
    target.defaultMuted = true;
    target.playsInline = true;
    if (visibleVariantRef.current !== targetVariant && target.readyState > HTMLMediaElement.HAVE_NOTHING) target.currentTime = 0;
    void target.play().catch(() => undefined);
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
    video.muted = true;
    video.defaultMuted = true;
    video.playsInline = true;
    void video.play().catch(() => undefined);
  };

  const showAfterFirstMovingFrame = (next: CompanionMotionVariant) => {
    const video = videoNodes.current.get(next);
    if (!video || video.currentTime <= 0) return;
    show(next);
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
            autoPlay
            muted
            loop
            playsInline
            preload={motionVariant === targetVariant ? "auto" : "none"}
            onLoadedData={() => warm(motionVariant)}
            onTimeUpdate={() => showAfterFirstMovingFrame(motionVariant)}
            onError={() => fail(motionVariant, source.jobId)}
          />
        );
      })}
    </div>
  );
}
