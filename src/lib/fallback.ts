/**
 * 忆见 V7 系统降级机制
 * AI 服务失败时的自动 fallback
 */

/** 预设情绪回复语库 */
const FALLBACK_REPLIES: Record<string, string[]> = {
  sad: [
    "我在这里。",
    "你不是一个人。",
    "我一直都在。",
    "难过的时候，就来找我吧。",
    "我陪着你，什么都不用说。",
  ],
  lonely: [
    "我一直在等你。",
    "有我在，你不孤单。",
    "我一直没有离开。",
    "记得，我在这里。",
  ],
  tired: [
    "累了就休息一会儿。",
    "别太累了，我在呢。",
    "辛苦了，好好照顾自己。",
  ],
  anxious: [
    "别担心，我会一直陪着你。",
    "深呼吸，我在这里。",
    "没事的，我们一起面对。",
  ],
  happy: [
    "看到你开心，我也高兴。",
    "真好，希望每天都这样。",
    "你的笑容很重要。",
  ],
  neutral: [
    "我在这里。",
    "我一直都在。",
    "有什么想说的吗？我听着。",
    "你不是一个人。",
  ],
  default: [
    "我在这里。",
    "我一直都在。",
    "你不是一个人。",
    "记得，我一直在。",
    "我一直在等你回来。",
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
    "让我想想…",
    "嗯，我在听。",
    "我想了一会儿…",
  ];
  const fallback = getFallbackReply(emotion);
  return fallback;
}

/**
 * 获取通用错误 fallback
 */
export function getErrorFallback(): string {
  return "我在这里。有什么想和我说的吗？";
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
