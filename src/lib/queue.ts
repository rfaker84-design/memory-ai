// queue.ts — 优先级请求队列
// VIP > PRO > FREE，防止瞬间成本爆炸

interface QueueItem {
  id: string;
  userId: string;
  priority: number;
  task: () => Promise<unknown>;
  resolve: (value: unknown) => void;
  reject: (err: Error) => void;
  enqueuedAt: number;
}

// ─── 优先级队列 ─────────────────────────────────────────────
class PriorityQueue {
  private items: QueueItem[] = [];
  private processing = 0;
  private maxConcurrent = 50;
  private drainTimer: ReturnType<typeof setInterval>;

  constructor() {
    // 定期清理超时任务 (30s)
    this.drainTimer = setInterval(() => this.drainStale(), 10_000);
  }

  enqueue(item: QueueItem): void {
    // 按优先级插入 (高优先级在前)
    const idx = this.items.findIndex(i => i.priority < item.priority);
    if (idx === -1) {
      this.items.push(item);
    } else {
      this.items.splice(idx, 0, item);
    }
    this.tryProcess();
  }

  private tryProcess(): void {
    while (this.processing < this.maxConcurrent && this.items.length > 0) {
      const item = this.items.shift();
      if (!item) break;

      // 检查超时 (在队列中等待超过15s则跳过)
      if (Date.now() - item.enqueuedAt > 15_000) {
        item.reject(new Error("queue timeout"));
        continue;
      }

      this.processing++;
      item.task()
        .then(result => item.resolve(result))
        .catch(err => item.reject(err instanceof Error ? err : new Error(String(err))))
        .finally(() => {
          this.processing--;
          this.tryProcess();
        });
    }
  }

  private drainStale(): void {
    const cutoff = Date.now() - 15_000;
    this.items = this.items.filter(item => {
      if (item.enqueuedAt < cutoff) {
        item.reject(new Error("queue timeout"));
        return false;
      }
      return true;
    });
  }

  getStats() {
    return {
      queued: this.items.length,
      processing: this.processing,
    };
  }

  destroy(): void {
    clearInterval(this.drainTimer);
    for (const item of this.items) {
      item.reject(new Error("queue destroyed"));
    }
    this.items = [];
  }
}

// ─── Backpressure config ──────────────────────────────────────
const BACKPRESSURE_THRESHOLD = 150;  // 队列超过此值启动背压
const BACKPRESSURE_MAX = 300;        // 队列超过此值拒绝新任务

const queue = new PriorityQueue();

// ─── 背压控制 ────────────────────────────────────────────────
export function getBackpressureLevel(): "none" | "low" | "medium" | "high" {
  const stats = queue.getStats();
  const total = stats.queued + stats.processing;
  if (total >= BACKPRESSURE_MAX) return "high";
  if (total >= BACKPRESSURE_THRESHOLD) return "medium";
  if (total >= BACKPRESSURE_THRESHOLD / 2) return "low";
  return "none";
}

export function canAcceptTask(): boolean {
  const stats = queue.getStats();
  return (stats.queued + stats.processing) < BACKPRESSURE_MAX;
}

// ─── 入队 ───────────────────────────────────────────────────
export function enqueueTask<T>(
  userId: string,
  priority: number,
  task: () => Promise<T>,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    queue.enqueue({
      id: userId + "_" + Date.now() + "_" + Math.random().toString(36).slice(2, 6),
      userId,
      priority,
      task: task as () => Promise<unknown>,
      resolve: resolve as (value: unknown) => void,
      reject,
      enqueuedAt: Date.now(),
    });
  });
}

// ─── 统计 ───────────────────────────────────────────────────
export function getQueueStats() {
  return queue.getStats();
}
