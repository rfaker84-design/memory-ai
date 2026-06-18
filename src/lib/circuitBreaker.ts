// ╔══════════════════════════════════════════════════════════════╗
// ║  circuitBreaker.ts — API 熔断机制 (V5 生产级)             ║
// ║  LLM/TTS/Avatar 失败率过高时自动切换 fallback              ║
// ╚══════════════════════════════════════════════════════════════╝

// ═══════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════
export type ServiceName = "llm" | "tts" | "avatar";

export type CircuitState = "closed" | "open" | "half_open";

interface CircuitConfig {
  failureThreshold: number;     // 失败率阈值 (0-1)
  successThreshold: number;     // 半开→关闭所需的连续成功次数
  timeoutMs: number;            // 开启→半开的冷却时间
  windowSize: number;           // 滑动窗口大小（请求数）
  halfOpenMaxRequests: number;  // 半开状态最大试探请求数
}

interface CircuitStats {
  state: CircuitState;
  failures: number;
  successes: number;
  totalCalls: number;
  lastFailureTime: number;
  openedAt: number;
  failureRate: number;
}

// ═══════════════════════════════════════════════════════════════
// 默认配置
// ═══════════════════════════════════════════════════════════════
const DEFAULT_CONFIG: Record<ServiceName, CircuitConfig> = {
  llm: {
    failureThreshold: 0.5,     // 50% 失败率触发熔断
    successThreshold: 3,       // 3次连续成功恢复
    timeoutMs: 30_000,         // 30秒冷却
    windowSize: 20,            // 20次请求窗口
    halfOpenMaxRequests: 3,
  },
  tts: {
    failureThreshold: 0.4,
    successThreshold: 2,
    timeoutMs: 20_000,
    windowSize: 15,
    halfOpenMaxRequests: 2,
  },
  avatar: {
    failureThreshold: 0.3,
    successThreshold: 2,
    timeoutMs: 60_000,
    windowSize: 10,
    halfOpenMaxRequests: 2,
  },
};

// ═══════════════════════════════════════════════════════════════
// Circuit Breaker 实现
// ═══════════════════════════════════════════════════════════════
class CircuitBreaker {
  private state: CircuitState = "closed";
  private failures = 0;
  private successes = 0;
  private windowResults: Array<"success" | "failure"> = [];
  private openedAt = 0;
  private halfOpenRequests = 0;
  private totalCalls = 0;
  private lastFailureTime = 0;

  constructor(private config: CircuitConfig) {}

  // 是否可以执行请求
  allowRequest(): boolean {
    switch (this.state) {
      case "closed":
        return true;
      case "open":
        if (Date.now() - this.openedAt > this.config.timeoutMs) {
          this.state = "half_open";
          this.halfOpenRequests = 0;
          return true;
        }
        return false;
      case "half_open":
        return this.halfOpenRequests < this.config.halfOpenMaxRequests;
    }
  }

  // 记录成功
  recordSuccess(): void {
    this.totalCalls++;
    this.successes++;
    this.slideWindow("success");

    if (this.state === "half_open") {
      this.halfOpenRequests++;
      if (this.successes >= this.config.successThreshold) {
        this.state = "closed";
        this.failures = 0;
        this.successes = 0;
      }
    }
  }

  // 记录失败
  recordFailure(): void {
    this.totalCalls++;
    this.failures++;
    this.lastFailureTime = Date.now();
    this.slideWindow("failure");

    const failureRate = this.windowResults.length > 0
      ? this.windowResults.filter(r => r === "failure").length / this.windowResults.length
      : 0;

    if (this.state === "closed" && failureRate >= this.config.failureThreshold) {
      this.state = "open";
      this.openedAt = Date.now();
      this.halfOpenRequests = 0;
    }

    if (this.state === "half_open") {
      this.state = "open";
      this.openedAt = Date.now();
      this.halfOpenRequests = 0;
    }
  }

  // 滑动窗口
  private slideWindow(result: "success" | "failure"): void {
    this.windowResults.push(result);
    if (this.windowResults.length > this.config.windowSize) {
      this.windowResults.shift();
    }
  }

  // 获取状态
  getStats(): CircuitStats {
    const failureRate = this.windowResults.length > 0
      ? this.windowResults.filter(r => r === "failure").length / this.windowResults.length
      : 0;
    return {
      state: this.state,
      failures: this.failures,
      successes: this.successes,
      totalCalls: this.totalCalls,
      lastFailureTime: this.lastFailureTime,
      openedAt: this.openedAt,
      failureRate,
    };
  }

  // 重置（手动恢复）
  reset(): void {
    this.state = "closed";
    this.failures = 0;
    this.successes = 0;
    this.windowResults = [];
    this.openedAt = 0;
    this.halfOpenRequests = 0;
  }
}

// ═══════════════════════════════════════════════════════════════
// 全局熔断器管理
// ═══════════════════════════════════════════════════════════════
const breakers = new Map<ServiceName, CircuitBreaker>();

function getBreaker(service: ServiceName): CircuitBreaker {
  let breaker = breakers.get(service);
  if (!breaker) {
    breaker = new CircuitBreaker(DEFAULT_CONFIG[service]);
    breakers.set(service, breaker);
  }
  return breaker;
}

// ═══════════════════════════════════════════════════════════════
// 对外接口：包裹异步调用
// ═══════════════════════════════════════════════════════════════
export async function withCircuitBreaker<T>(
  service: ServiceName,
  fn: () => Promise<T>,
  fallback: () => T,
): Promise<{ result: T; circuitOpen: boolean }> {
  const breaker = getBreaker(service);

  if (!breaker.allowRequest()) {
    return { result: fallback(), circuitOpen: true };
  }

  try {
    const result = await fn();
    breaker.recordSuccess();
    return { result, circuitOpen: false };
  } catch {
    breaker.recordFailure();
    return { result: fallback(), circuitOpen: true };
  }
}

// ═══════════════════════════════════════════════════════════════
// 状态查询（管理面板用）
// ═══════════════════════════════════════════════════════════════
export function getAllCircuitStats(): Record<ServiceName, CircuitStats> {
  return {
    llm: getBreaker("llm").getStats(),
    tts: getBreaker("tts").getStats(),
    avatar: getBreaker("avatar").getStats(),
  };
}

export function resetCircuit(service: ServiceName): void {
  getBreaker(service).reset();
}
