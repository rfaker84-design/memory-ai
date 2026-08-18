/**
 * 忆见 V7 系统降级机制
 * AI 服务失败时的自动 fallback
 */

/** 预设情绪回复语库 */
const FALLBACK_REPLIES: Record<string, string[]> = {
  sad: [
    "我会根据你确认的信息继续整理。",
    "可以从一件具体的事开始。",
    "这段内容由 AI 生成。",
    "如有需要，可以联系身边可信任的人。",
    "你可以稍后继续。",
  ],
  lonely: [
    "可以从一件具体的事开始。",
    "这段内容由 AI 生成。",
    "你可以稍后继续。",
    "如有需要，可以联系身边可信任的人。",
  ],
  tired: [
    "可以稍后继续。",
    "请先照顾好自己。",
    "如有需要，可以联系身边可信任的人。",
  ],
  anxious: [
    "请先确认身边环境安全。",
    "如有需要，请联系身边可信任的人。",
    "可以稍后继续。",
  ],
  happy: [
    "这段内容由 AI 生成。",
    "可以保存这一刻。",
    "你可以继续分享一件小事。",
  ],
  neutral: [
    "可以从一件具体的事开始。",
    "这段内容由 AI 生成。",
    "你可以稍后继续。",
    "如有需要，可以联系身边可信任的人。",
  ],
  default: [
    "可以从一件具体的事开始。",
    "这段内容由 AI 生成。",
    "你可以稍后继续。",
    "如有需要，可以联系身边可信任的人。",
    "请确认后再继续。",
  ],
};

/**
 * 根据情绪获取 fallback 回复
 */
export function getFallbackReply(emotion?: string): string {
  const pool = FALLBACK_REPLIES[emotion || ""] || FALLBACK_REPLIES.default;
  return pool[Math.floor(Math.random() * pool.length)];
}

/**
 * 获取 AI 超时 fallback
 */
export function getTimeoutFallback(emotion?: string): string {
  const extras = [
    "正在生成…",
    "正在整理…",
    "请稍候…",
  ];
  const fallback = getFallbackReply(emotion);
  return fallback;
}

/**
 * 获取通用错误 fallback
 */
export function getErrorFallback(): string {
  return "这次没有生成回复，请稍后重试。";
}

/**
 * 安全调用 OpenAI，超时自动 fallback
 */
export async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  fallback: () => T
): Promise<T> {
  try {
    const result = await Promise.race([
      promise,
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("AI_TIMEOUT")), timeoutMs)
      ),
    ]);
    return result;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg === "AI_TIMEOUT" || msg.includes("timeout") || msg.includes("ETIMEDOUT")) {
      return fallback();
    }
    throw err; // Non-timeout errors still propagate
  }
}
