"use client";

import { MotionProvider } from "@/src/motion";

import { CommerceVideoCreditsEntry } from "./CommerceVideoCreditsEntry";

export function CommerceEntryPreviewShell() {
  return (
    <MotionProvider>
      <div style={{ maxWidth: 390, margin: "0 auto", paddingTop: "12rem" }}>
        <CommerceVideoCreditsEntry memoryId="commerce-entry-preview" />
      </div>
    </MotionProvider>
  );
}
