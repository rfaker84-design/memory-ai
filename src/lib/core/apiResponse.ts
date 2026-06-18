// apiResponse.ts — Unified API Response Builder
// Ensures all API routes return a consistent { success, data, error } structure
// Rule: NEVER throw errors to the frontend; always wrap in this format

export interface ApiSuccess<T = unknown> {
  success: true;
  data: T;
  latencyMs?: number;
}

export interface ApiError {
  success: false;
  error: string;
  code?: string;
  retryAfterMs?: number;
  latencyMs?: number;
}

export type ApiResponse<T = unknown> = ApiSuccess<T> | ApiError;

// ─── Success response ──────────────────────────────────────
export function ok<T>(data: T, extra?: { latencyMs?: number }): ApiSuccess<T> {
  return {
    success: true,
    data,
    ...(extra?.latencyMs != null ? { latencyMs: extra.latencyMs } : {}),
  };
}

// ─── Error response ────────────────────────────────────────
export function fail(
  error: string,
  opts?: { code?: string; retryAfterMs?: number; latencyMs?: number },
): ApiError {
  return {
    success: false,
    error,
    ...(opts?.code ? { code: opts.code } : {}),
    ...(opts?.retryAfterMs != null ? { retryAfterMs: opts.retryAfterMs } : {}),
    ...(opts?.latencyMs != null ? { latencyMs: opts.latencyMs } : {}),
  };
}

// ─── Catch-all: wraps any function, never throws ───────────
export async function safeApi<T>(
  fn: () => Promise<T>,
  fallbackError = "服务暂时不可用",
): Promise<ApiResponse<T>> {
  try {
    const data = await fn();
    return ok(data);
  } catch (err) {
    const msg = err instanceof Error ? err.message : fallbackError;
    return fail(msg);
  }
}
