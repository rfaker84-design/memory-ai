export type MotionFrame = {
  time: number;
  delta: number;
  elapsed: number;
};

type MotionFrameListener = (frame: MotionFrame) => void;

const createInitialFrame = (): MotionFrame => ({
  time: 0,
  delta: 0,
  elapsed: 0,
});

export class MotionClock {
  private frame: MotionFrame = createInitialFrame();
  private listeners = new Set<MotionFrameListener>();
  private rafId: number | null = null;
  private startedAt = 0;
  private lastTime = 0;

  getSnapshot(): MotionFrame {
    return this.frame;
  }

  subscribe(listener: MotionFrameListener): () => void {
    this.listeners.add(listener);
    listener(this.frame);

    return () => {
      this.listeners.delete(listener);
    };
  }

  start(): void {
    if (this.rafId != null || typeof window === "undefined") return;

    this.startedAt = performance.now();
    this.lastTime = this.startedAt;
    this.rafId = window.requestAnimationFrame(this.tick);
  }

  stop(): void {
    if (this.rafId == null || typeof window === "undefined") return;

    window.cancelAnimationFrame(this.rafId);
    this.rafId = null;
  }

  private tick = (time: number): void => {
    const delta = Math.min(time - this.lastTime, 64);
    this.lastTime = time;
    this.frame = {
      time,
      delta,
      elapsed: time - this.startedAt,
    };

    this.listeners.forEach((listener) => listener(this.frame));
    this.rafId = window.requestAnimationFrame(this.tick);
  };
}
