export type MotionSpringOptions = {
  stiffness: number;
  damping: number;
  mass: number;
  precision: number;
};

export type MotionSpringSnapshot = {
  value: number;
  velocity: number;
  target: number;
  settled: boolean;
};

export class MotionSpring {
  private value: number;
  private velocity = 0;
  private target: number;

  constructor(initialValue: number, private readonly options: MotionSpringOptions) {
    this.value = initialValue;
    this.target = initialValue;
  }

  setTarget(target: number): void {
    this.target = target;
  }

  snap(value: number): MotionSpringSnapshot {
    this.value = value;
    this.target = value;
    this.velocity = 0;
    return this.getSnapshot();
  }

  step(deltaMs: number): MotionSpringSnapshot {
    const deltaSeconds = Math.min(deltaMs / 1000, 0.064);
    const displacement = this.value - this.target;
    const springForce = -this.options.stiffness * displacement;
    const dampingForce = -this.options.damping * this.velocity;
    const acceleration = (springForce + dampingForce) / this.options.mass;

    this.velocity += acceleration * deltaSeconds;
    this.value += this.velocity * deltaSeconds;

    if (
      Math.abs(this.target - this.value) < this.options.precision &&
      Math.abs(this.velocity) < this.options.precision
    ) {
      this.value = this.target;
      this.velocity = 0;
    }

    return this.getSnapshot();
  }

  getSnapshot(): MotionSpringSnapshot {
    return {
      value: this.value,
      velocity: this.velocity,
      target: this.target,
      settled: this.value === this.target && this.velocity === 0,
    };
  }
}
