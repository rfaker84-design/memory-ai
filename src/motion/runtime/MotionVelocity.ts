import type { MotionFrame } from "./MotionClock";
import type { MotionScrollSnapshot } from "./MotionScroll";

export type MotionVelocitySnapshot = {
  x: number;
  y: number;
  clampedX: number;
  clampedY: number;
};

const clamp = (value: number, limit: number): number =>
  Math.min(limit, Math.max(-limit, value));

export class MotionVelocity {
  private previousScroll: MotionScrollSnapshot | null = null;
  private previousTime = 0;
  private snapshot: MotionVelocitySnapshot = {
    x: 0,
    y: 0,
    clampedX: 0,
    clampedY: 0,
  };

  constructor(private readonly clampLimit: number) {}

  update(scroll: MotionScrollSnapshot, frame: MotionFrame): MotionVelocitySnapshot {
    if (!this.previousScroll || frame.time === this.previousTime) {
      this.previousScroll = scroll;
      this.previousTime = frame.time;
      return this.snapshot;
    }

    const seconds = Math.max((frame.time - this.previousTime) / 1000, 0.001);
    const x = (scroll.x - this.previousScroll.x) / seconds;
    const y = (scroll.y - this.previousScroll.y) / seconds;

    this.snapshot = {
      x,
      y,
      clampedX: clamp(x, this.clampLimit),
      clampedY: clamp(y, this.clampLimit),
    };
    this.previousScroll = scroll;
    this.previousTime = frame.time;

    return this.snapshot;
  }

  getSnapshot(): MotionVelocitySnapshot {
    return this.snapshot;
  }
}
