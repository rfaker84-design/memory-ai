"use client";

import { useState } from "react";

import styles from "./SoundscapeControl.module.css";
import { SOUNDSCAPE_PLAYER_LABELS } from "./SoundscapePlayer";
import type { SoundscapeId, SoundscapePreference } from "./types";

type Props = {
  preference: SoundscapePreference;
  soundscape: SoundscapeId;
  awaitingActivation: boolean;
  playing: boolean;
  onPrimaryAction: () => void;
  onPrevious: () => void;
  onNext: () => void;
  onVolumeChange: (volume: number) => void;
};

export function SoundscapeControl({
  preference,
  soundscape,
  awaitingActivation,
  playing,
  onPrimaryAction,
  onPrevious,
  onNext,
  onVolumeChange,
}: Props) {
  const [expanded, setExpanded] = useState(false);
  const title = SOUNDSCAPE_PLAYER_LABELS[soundscape];
  const action = preference.enabled ? awaitingActivation ? "继续" : "暂停" : "播放";

  return (
    <aside
      aria-label="环境声播放器"
      className={`${styles.shell} ${expanded ? styles.expanded : ""}`}
      data-soundscape-control="true"
      data-expanded={expanded ? "true" : "false"}
    >
      <section className={styles.controls} aria-hidden={!expanded}>
        <button className={styles.stepButton} type="button" onClick={onPrevious} tabIndex={expanded ? 0 : -1} aria-label="上一个声景">
          上一景
        </button>
        <button className={styles.primaryButton} type="button" onClick={onPrimaryAction} tabIndex={expanded ? 0 : -1} aria-label={`${title}，${action}`}>
          <span className={styles.title}>{title}</span>
          <span className={styles.action}>{action}</span>
        </button>
        <button className={styles.stepButton} type="button" onClick={onNext} tabIndex={expanded ? 0 : -1} aria-label="下一个声景">
          下一景
        </button>
        <label className={styles.volume}>
          <span className={styles.visuallyHidden}>环境声音量</span>
          <input
            aria-label="环境声音量"
            type="range"
            min="0.08"
            max="0.35"
            step="0.01"
            value={preference.volume}
            tabIndex={expanded ? 0 : -1}
            onChange={(event) => onVolumeChange(Number(event.target.value))}
          />
        </label>
      </section>

      <button
        className={styles.discButton}
        type="button"
        aria-expanded={expanded}
        aria-label={expanded ? "收起环境声播放器" : "展开环境声播放器"}
        onClick={() => setExpanded((current) => !current)}
      >
        <img
          className={`${styles.disc} ${playing ? styles.spinning : ""}`}
          src="/soundscape/mini-cd-player.png"
          width="42"
          height="42"
          alt=""
          aria-hidden="true"
          draggable="false"
        />
        <span className={styles.visuallyHidden}>{playing ? `${title}正在播放` : `${title}未播放`}</span>
      </button>
    </aside>
  );
}
