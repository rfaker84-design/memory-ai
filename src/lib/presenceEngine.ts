// presenceEngine.ts — Emotion → UI mapping system
//
// Maps emotional states to visual parameters:
//   warm → glow orange
//   calm → soft blue
//   sad → dim gray
//   nostalgic → blur warm light

export type EmotionState = "warm" | "calm" | "sad" | "nostalgic" | "thinking";

export interface PresenceConfig {
  emotion: EmotionState;
  intensity: number;         // 0–1
  speaking: boolean;
  listening: boolean;
}

export interface PresenceVisuals {
  // Glow
  glowColor: string;
  glowIntensity: number;
  glowSize: number;

  // Face
  scale: number;
  brightness: number;
  saturate: number;
  blur: number;

  // Animation
  breatheDuration: number;   // seconds for one breathe cycle
  pulseDuration: number;
  driftX: number;
  driftY: number;

  // CSS
  filter: string;
  boxShadow: string;
  backgroundGlow: string;
}

const EMOTION_PALETTE: Record<EmotionState, {
  hue: number; sat: number; light: number; alpha: number;
}> = {
  warm:    { hue: 35,  sat: 80, light: 65, alpha: 0.3 },
  calm:    { hue: 210, sat: 40, light: 65, alpha: 0.2 },
  sad:     { hue: 220, sat: 20, light: 45, alpha: 0.15 },
  nostalgic:{ hue: 30, sat: 50, light: 60, alpha: 0.25 },
  thinking: { hue: 260, sat: 30, light: 60, alpha: 0.22 },
};

// ─── Compute presence visuals from config ───────────────────
export function computePresence(config: PresenceConfig): PresenceVisuals {
  const palette = EMOTION_PALETTE[config.emotion] || EMOTION_PALETTE.calm;
  const { hue, sat, light, alpha } = palette;
  const intensity = config.intensity;

  // Glow
  const glowIntensity = alpha + intensity * 0.15 + (config.speaking ? 0.2 : 0);
  const glowColor = "hsla(" + hue + "," + sat + "%," + light + "%,";
  const glowSize = 50 + intensity * 30 + (config.speaking ? 30 : 0);

  // Face adjustments
  const brightness = 1 + (config.emotion === "warm" ? intensity * 0.12 : 0)
                       - (config.emotion === "sad" ? intensity * 0.1 : 0);
  const saturate = 1 + (config.emotion === "warm" ? intensity * 0.08 : 0)
                     - (config.emotion === "sad" ? intensity * 0.12 : 0);
  const blur = config.emotion === "nostalgic" ? intensity * 1.5 : 0;
  const scale = 1 + (config.speaking ? intensity * 0.02 : 0)
                  + (config.listening ? intensity * 0.03 : 0);

  // Animation timing
  const breatheDuration = config.emotion === "calm" ? 6 : config.emotion === "sad" ? 8 : 5;
  const pulseDuration = config.speaking ? 0.6 : 3;

  // Micro motion
  const driftX = config.listening ? intensity * 2 : intensity * 0.5;
  const driftY = config.speaking ? intensity * 1.5 : intensity * 0.3;

  // CSS
  const filter = [
    "brightness(" + brightness.toFixed(2) + ")",
    "saturate(" + saturate.toFixed(2) + ")",
    blur > 0 ? "blur(" + blur.toFixed(1) + "px)" : "",
  ].filter(Boolean).join(" ");

  const boxShadow = [
    "0 0 " + glowSize + "px " + glowColor + glowIntensity.toFixed(2) + ")",
    "0 0 " + (glowSize * 1.5) + "px " + glowColor + (glowIntensity * 0.5).toFixed(2) + ")",
    "0 0 0 1px rgba(255,255,255,0.05)",
  ].join(", ");

  const backgroundGlow =
    "radial-gradient(circle, " + glowColor + glowIntensity.toFixed(2) + ") 0%, transparent 65%)";

  return {
    glowColor: glowColor + "1)",
    glowIntensity, glowSize,
    scale, brightness, saturate, blur,
    breatheDuration, pulseDuration, driftX, driftY,
    filter, boxShadow, backgroundGlow,
  };
}
