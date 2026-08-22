"use client";

type Interaction =
  | { eventName: "guest_experience_started"; idempotencyKey: string; properties: { surface: "guest_home" } }
  | { eventName: "photo_upload_succeeded"; idempotencyKey: string; memoryId: string; properties: { surface: "first_presence" } }
  | { eventName: "first_presence_video_played_3s"; idempotencyKey: string; memoryId: string; properties: { elapsed_ms: 3000; job_id?: string } }
  | { eventName: "paywall_viewed"; idempotencyKey: string; memoryId: string; properties: { surface: "commerce"; offer_id?: string } };

/** Metrics must never delay, retry, or surface an error for product actions. */
export function reportProductInteraction(interaction: Interaction): void {
  void fetch("/api/product-interactions", {
    method: "POST",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ schemaVersion: 1, ...interaction }),
  }).catch(() => undefined);
}
