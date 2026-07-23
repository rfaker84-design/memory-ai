export type BusinessViewEvent = "first_greeting_viewed" | "payment_entry_viewed";

export function recordBusinessView(event: BusinessViewEvent, memoryId: string, request: typeof fetch = fetch): void {
  void request("/api/business-events", {
    method: "POST",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ event, memoryId }),
    keepalive: true,
  }).catch(() => undefined);
}
