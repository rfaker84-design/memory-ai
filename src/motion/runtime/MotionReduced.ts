type ReducedMotionListener = (reduced: boolean) => void;

export class MotionReduced {
  private reduced = false;
  private listeners = new Set<ReducedMotionListener>();
  private mediaQuery: MediaQueryList | null = null;

  getSnapshot(): boolean {
    return this.reduced;
  }

  subscribe(listener: ReducedMotionListener): () => void {
    this.listeners.add(listener);
    listener(this.reduced);

    if (!this.mediaQuery) {
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
    if (typeof window === "undefined" || this.mediaQuery) return;

    this.mediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    this.reduced = this.mediaQuery.matches;
    this.mediaQuery.addEventListener("change", this.handleChange);
    this.emit();
  }

  stop(): void {
    if (!this.mediaQuery) return;

    this.mediaQuery.removeEventListener("change", this.handleChange);
    this.mediaQuery = null;
  }

  private handleChange = (event: MediaQueryListEvent): void => {
    this.reduced = event.matches;
    this.emit();
  };

  private emit(): void {
    this.listeners.forEach((listener) => listener(this.reduced));
  }
}
