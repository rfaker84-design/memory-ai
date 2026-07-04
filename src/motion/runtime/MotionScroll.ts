export type MotionScrollSnapshot = {
  x: number;
  y: number;
  maxX: number;
  maxY: number;
  progressX: number;
  progressY: number;
  directionX: -1 | 0 | 1;
  directionY: -1 | 0 | 1;
};

type MotionScrollListener = (snapshot: MotionScrollSnapshot) => void;

const clamp01 = (value: number): number => Math.min(1, Math.max(0, value));

const direction = (current: number, previous: number): -1 | 0 | 1 => {
  if (current > previous) return 1;
  if (current < previous) return -1;
  return 0;
};

const emptySnapshot: MotionScrollSnapshot = {
  x: 0,
  y: 0,
  maxX: 0,
  maxY: 0,
  progressX: 0,
  progressY: 0,
  directionX: 0,
  directionY: 0,
};

export class MotionScroll {
  private snapshot: MotionScrollSnapshot = emptySnapshot;
  private listeners = new Set<MotionScrollListener>();
  private listening = false;

  getSnapshot(): MotionScrollSnapshot {
    return this.snapshot;
  }

  subscribe(listener: MotionScrollListener): () => void {
    this.listeners.add(listener);
    listener(this.snapshot);

    if (!this.listening) {
      this.start();
    }

    return () => {
      this.listeners.delete(listener);
      if (this.listeners.size === 0) {
        this.stop();
      }
    };
  }

  start(): void {
    if (this.listening || typeof window === "undefined") return;

    this.listening = true;
    this.measure();
    window.addEventListener("scroll", this.measure, { passive: true });
    window.addEventListener("resize", this.measure);
  }

  stop(): void {
    if (!this.listening || typeof window === "undefined") return;

    window.removeEventListener("scroll", this.measure);
    window.removeEventListener("resize", this.measure);
    this.listening = false;
  }

  private measure = (): void => {
    if (typeof window === "undefined") return;

    const previous = this.snapshot;
    const documentElement = document.documentElement;
    const maxX = Math.max(0, documentElement.scrollWidth - window.innerWidth);
    const maxY = Math.max(0, documentElement.scrollHeight - window.innerHeight);
    const x = window.scrollX;
    const y = window.scrollY;

    this.snapshot = {
      x,
      y,
      maxX,
      maxY,
      progressX: maxX === 0 ? 0 : clamp01(x / maxX),
      progressY: maxY === 0 ? 0 : clamp01(y / maxY),
      directionX: direction(x, previous.x),
      directionY: direction(y, previous.y),
    };

    this.listeners.forEach((listener) => listener(this.snapshot));
  };
}
