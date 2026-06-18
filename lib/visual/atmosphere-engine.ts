/* ============================================================
   忆见 MemoryAI — Atmosphere Engine V1
   Fog density · Star brightness curve · Depth fade · Cinematic mood
   ============================================================ */

/* ── Atmosphere State ─────────────────────────────────── */
export interface AtmosphereState {
  fogDensity: number;          // 0.01–0.04
  starBrightnessMul: number;   // 0.3–1.0
  depthFadeStart: number;      // distance where fade begins
  depthFadeEnd: number;        // distance where stars fully fade
  voidColor: string;           // background color
  fogColor: string;            // fog color
  bloomIntensity: number;      // 0.2–0.8
  vignetteDarkness: number;    // 0.3–0.6
  cameraDriftSpeed: number;    // 0.02–0.06
}

/* ── Presets ──────────────────────────────────────────── */
export const ATMOSPHERE_PRESETS = {
  interstellar: {
    fogDensity: 0.018,
    starBrightnessMul: 0.55,
    depthFadeStart: 6,
    depthFadeEnd: 26,
    voidColor: "#010206",
    fogColor: "#08080C",
    bloomIntensity: 0.4,
    vignetteDarkness: 0.55,
    cameraDriftSpeed: 0.035,
  },
  appleVisionPro: {
    fogDensity: 0.015,
    starBrightnessMul: 0.50,
    depthFadeStart: 8,
    depthFadeEnd: 28,
    voidColor: "#010105",
    fogColor: "#0A0808",
    bloomIntensity: 0.35,
    vignetteDarkness: 0.5,
    cameraDriftSpeed: 0.03,
  },
  emotionalMemory: {
    fogDensity: 0.022,
    starBrightnessMul: 0.60,
    depthFadeStart: 5,
    depthFadeEnd: 22,
    voidColor: "#030408",
    fogColor: "#0B0A08",
    bloomIntensity: 0.45,
    vignetteDarkness: 0.5,
    cameraDriftSpeed: 0.04,
  },
} as const;

export type AtmospherePreset = keyof typeof ATMOSPHERE_PRESETS;

/* ── Default → interstellar ───────────────────────────── */
export function createAtmosphere(preset: AtmospherePreset = "interstellar"): AtmosphereState {
  return { ...ATMOSPHERE_PRESETS[preset] };
}

/* ── Lerp between presets ─────────────────────────────── */
export function lerpAtmosphere(a: AtmosphereState, b: AtmosphereState, t: number): AtmosphereState {
  const l = (k: keyof AtmosphereState) => {
    const va = a[k] as number;
    const vb = b[k] as number;
    return va + (vb - va) * t;
  };
  return {
    fogDensity: l("fogDensity"),
    starBrightnessMul: l("starBrightnessMul"),
    depthFadeStart: l("depthFadeStart"),
    depthFadeEnd: l("depthFadeEnd"),
    voidColor: a.voidColor,
    fogColor: a.fogColor,
    bloomIntensity: l("bloomIntensity"),
    vignetteDarkness: l("vignetteDarkness"),
    cameraDriftSpeed: l("cameraDriftSpeed"),
  };
}

/* ── Depth-based star visibility curve ────────────────── */
export function depthVisibility(
  distance: number,
  fadeStart: number,
  fadeEnd: number,
): number {
  if (distance < fadeStart) return 1.0;
  if (distance > fadeEnd) return 0.05;
  const t = (distance - fadeStart) / (fadeEnd - fadeStart);
  // Ease-out cubic
  return 1 - t * t * (3 - 2 * t);
}

/* ── Breathing value (sinusoidal, slow) ───────────────── */
export function breathingValue(base: number, amplitude: number, frequency: number, elapsed: number): number {
  return base + Math.sin(elapsed * frequency) * amplitude;
}
