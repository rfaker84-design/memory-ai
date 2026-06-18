// withTimeout.ts — Request timeout & retry wrapper
// Prevents hanging requests and infinite loading states

export interface TimeoutOpts {
  timeoutMs?: number;    // default 8000ms
  retries?: number;      // default 0 (no retry)
  retryDelayMs?: number; // delay between retries, default 300ms
}

const DEFAULT_TIMEOUT = 8000;

// ─── Timeout wrapper ───────────────────────────────────────
export async function withTimeout<T>(
  fn: () => Promise<T>,
  opts: TimeoutOpts = {},
): Promise<T> {
  const { timeoutMs = DEFAULT_TIMEOUT, retries = 0, retryDelayMs = 300 } = opts;

  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const result = await Promise.race([
        fn(),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error("请求超时")), timeoutMs),
        ),
      ]);
      return result;
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      if (attempt < retries) {
        await new Promise((r) => setTimeout(r, retryDelayMs));
      }
    }
  }

  throw lastError || new Error("请求失败");
}

// ─── AbortController timeout ───────────────────────────────
export function createTimeoutSignal(ms: number = DEFAULT_TIMEOUT): {
  signal: AbortSignal;
  clear: () => void;
} {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  return {
    signal: controller.signal,
    clear: () => clearTimeout(timer),
  };
}
