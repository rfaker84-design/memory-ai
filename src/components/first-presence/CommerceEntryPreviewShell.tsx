"use client";

import { useState } from "react";

import { MotionProvider } from "@/src/motion";

import {
  CommerceVideoCreditsEntryView,
  type CommerceVideoCreditsEntryStyles,
} from "./CommerceVideoCreditsEntryView";
import {
  previewCommerceVideoCreditsBalanceState,
  type CommerceVideoCreditsPreviewState,
} from "./commerceVideoCreditsEntryState";
import styles from "./CommerceVideoCreditsEntry.module.css";

const previewStates: Array<{ label: string; value: CommerceVideoCreditsPreviewState }> = [
  { label: "加载中", value: "loading" },
  { label: "有额度", value: "available" },
  { label: "无额度", value: "empty" },
  { label: "查询失败", value: "unavailable" },
];

const entryStyles: CommerceVideoCreditsEntryStyles = styles;

export function CommerceEntryPreviewShell() {
  const [previewBalanceState, setPreviewBalanceState] = useState<CommerceVideoCreditsPreviewState>("loading");

  return (
    <MotionProvider>
      <div style={{ maxWidth: 390, margin: "0 auto", paddingTop: "12rem" }}>
        <p style={{ color: "rgba(244, 231, 216, 0.62)", fontSize: "0.75rem", lineHeight: 1.5 }}>
          内部验收预览：余额状态切换
        </p>
        <div aria-label="余额状态预览" role="group" style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem", marginTop: "0.75rem" }}>
          {previewStates.map((state) => (
            <button
              key={state.value}
              type="button"
              onClick={() => setPreviewBalanceState(state.value)}
              aria-pressed={previewBalanceState === state.value}
              style={{
                border: "1px solid rgba(218, 180, 118, 0.35)",
                borderRadius: "999px",
                background: previewBalanceState === state.value ? "rgba(143, 99, 58, 0.35)" : "transparent",
                color: "#f1d8ba",
                minHeight: "2.4rem",
                padding: "0 0.8rem",
              }}
            >
              {state.label}
            </button>
          ))}
        </div>
        <aside className={styles.entry} aria-labelledby="commerce-entry-preview-title">
          <CommerceVideoCreditsEntryView
            balanceState={previewCommerceVideoCreditsBalanceState(previewBalanceState)}
            catalogLoading={false}
            catalogUnavailable={false}
            memoryId="commerce-entry-preview"
            notice=""
            products={[]}
            referral={null}
            styles={entryStyles}
            submitting={null}
            titleId="commerce-entry-preview-title"
            view="choices"
            onBack={() => undefined}
            onCreateOrder={() => undefined}
            onOpenInvite={() => undefined}
            onOpenPackages={() => undefined}
            onRetryBalance={() => setPreviewBalanceState("loading")}
          />
        </aside>
      </div>
    </MotionProvider>
  );
}
