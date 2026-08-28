"use client";

import type { CSSProperties } from "react";

import type { SoundscapePreference } from "./types";

type Props = {
  preference: SoundscapePreference;
  awaitingActivation: boolean;
  onPrimaryAction: () => void;
  onVolumeChange: (volume: number) => void;
};

const shellStyle: CSSProperties = {
  position: "fixed",
  zIndex: 60,
  right: "max(16px, env(safe-area-inset-right))",
  bottom: "calc(var(--nav-height, 64px) + env(safe-area-inset-bottom, 0px) + 12px)",
  display: "grid", gap: 8, minWidth: 126, padding: 8, border: "1px solid rgba(224, 195, 137, 0.26)", borderRadius: 16,
  background: "rgba(18, 15, 12, 0.8)", boxShadow: "0 8px 28px rgba(0, 0, 0, 0.24)", backdropFilter: "blur(12px)",
};

export function SoundscapeControl({ preference, awaitingActivation, onPrimaryAction, onVolumeChange }: Props) {
  const primaryLabel = preference.enabled ? awaitingActivation ? "轻触继续" : "关闭" : "开启";
  return (
    <aside aria-label="环境声" data-soundscape-control="true" style={shellStyle}>
      <button type="button" aria-pressed={preference.enabled} onClick={onPrimaryAction} style={{ minHeight: 40, border: 0, borderRadius: 11, color: "#fff8ec", background: "rgba(213, 170, 97, 0.2)", cursor: "pointer", fontSize: 13 }}>
        环境声 · {primaryLabel}
      </button>
      {preference.enabled ? (
        <label style={{ display: "grid", gridTemplateColumns: "32px 1fr", alignItems: "center", gap: 8, color: "rgba(255, 248, 236, 0.74)", fontSize: 11 }}>
          音量
          <input aria-label="环境声音量" type="range" min="0.08" max="0.35" step="0.01" value={preference.volume} onChange={(event) => onVolumeChange(Number(event.target.value))} />
        </label>
      ) : null}
    </aside>
  );
}
