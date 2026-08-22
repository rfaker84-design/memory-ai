const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;
const BURST_LIMIT = 12;
const HOURLY_LIMIT = 60;

type Window = { count: number; resetAt: number };
const burst = new Map<string, Window>();
const hourly = new Map<string, Window>();

function consume(store: Map<string, Window>, key: string, windowMs: number, limit: number, now: number): boolean {
  const current = store.get(key);
  if (!current || current.resetAt <= now) {
    store.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }
  if (current.count >= limit) return false;
  current.count += 1;
  return true;
}

/**
 * This endpoint is intentionally isolated from business request limits.  It
 * fails closed per server-resolved subject: 12 events/minute and 60/hour.
 */
export function consumeProductInteractionRateLimit(subject: string, now = Date.now()): { allowed: boolean; retryAfterSeconds: number } {
  const burstAllowed = consume(burst, subject, MINUTE_MS, BURST_LIMIT, now);
  const hourlyAllowed = burstAllowed && consume(hourly, subject, HOUR_MS, HOURLY_LIMIT, now);
  if (burstAllowed && hourlyAllowed) return { allowed: true, retryAfterSeconds: 0 };
  const retryAt = Math.min(burst.get(subject)?.resetAt ?? now + MINUTE_MS, hourly.get(subject)?.resetAt ?? now + HOUR_MS);
  return { allowed: false, retryAfterSeconds: Math.max(1, Math.ceil((retryAt - now) / 1000)) };
}

export function resetProductInteractionRateLimitForTest(): void {
  burst.clear();
  hourly.clear();
}
