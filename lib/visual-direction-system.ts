/* ════════════════════════════════════════════════════════
   忆见 MemoryAI — Visual Direction System V1
   全局视觉规则 · 光影 · 镜头 · 空间 · 材质 · 动画
   ════════════════════════════════════════════════════════ */

/* ── Core Palette ────────────────────────────────────── */
export const PALETTE = {
  background: "#0B0A08",
  deepSpace:  "#020408",
  moonGlow:   "#FFD2A6",
  warmGold:   "#FFB37C",
  innerLight: "#FFF3E8",
  mutedText:  "#D6BBA6",
  fogColor:   "#0B0A08",
} as const;

/* ── Light Rules ─────────────────────────────────────── */
export const LIGHT_RULES = {
  primaryColor: PALETTE.moonGlow,
  ambientIntensity: 0.07,
  directionalIntensity: 0.08,

  rules: [
    "Only one main warm light source",
    "Light must be emotional, never functional",
    "No pure white light (#FFFFFF forbidden)",
    "No neon / cyber lighting",
    "PointLight decay ≥ 2 for soft falloff",
  ],

  settings: {
    moonPointLight:   { color: PALETTE.moonGlow, intensity: 2.2, distance: 10, decay: 2.2 },
    moonFillLight:    { color: PALETTE.warmGold, intensity: 1.0, distance: 6, decay: 2.8 },
    entityLight:      { color: PALETTE.moonGlow, intensity: 0.5, distance: 3, decay: 2 },
    gateLight:        { color: PALETTE.moonGlow, intensity: 1, distance: 4, decay: 2 },
    ambientLight:     { color: PALETTE.moonGlow, intensity: 0.1 },
    directionalLight: { color: PALETTE.innerLight, intensity: 0.12, position: [3, 5, 4] as const },
  },
} as const;

/* ── Camera Rules ────────────────────────────────────── */
export const CAMERA_RULES = {
  speed: "0.08 – 0.15 units/s",
  movement: "slow dolly-in only",
  easing: "implicit sinusoidal float",
  startZ: 8.5,
  endZ: 5.5,
  fov: 52,
  near: 0.1,
  far: 30,

  forbidden: [
    "shake / handheld",
    "fast pan / whip pan",
    "game-style orbit",
    "abrupt cut transition",
  ],

  floatAmplitudeY: 0.12,
  floatFrequencyY: 0.25,
  swayAmplitudeX: 0.06,
  swayFrequencyX: 0.18,
} as const;

/* ── Space Rules ─────────────────────────────────────── */
export const SPACE_RULES = {
  fogColor: PALETTE.fogColor,
  fogDensity: 0.025,
  composition: "center emotional focus (moon at origin)",
  density: "low — sparse objects, generous negative space",

  forbidden: [
    "UI-dense layout",
    "game-object clutter",
    "sharp contrast between foreground and background",
  ],

  moonRadius: 0.75,
  moonPosition: [0, 0.15, -0.8] as const,
  gatePosition: [0, 0.25, -3.2] as const,
  entityOrbitRadius: 1.6,
  entityOrbitSpeed: 0.15,
} as const;

/* ── Material Rules ──────────────────────────────────── */
export const MATERIAL_RULES = {
  style: "glass + emissive + soft blur",
  roughness: "0.25 – 0.35",
  metalness: "0.15 – 0.3",
  emissiveIntensity: "0.4 – 0.7",
  opacity: "0.7 – 0.8 (for entities)",

  forbidden: [
    "neon plastic (#00FFFF etc.)",
    "hard-shadow materials (metalness > 0.95)",
    "pure black diffuse (emissive must be present)",
  ],

  moon: {
    color: PALETTE.moonGlow,
    roughness: 0.3,
    metalness: 0.15,
    emissive: PALETTE.moonGlow,
    emissiveIntensity: 0.7,
  },

  entity: {
    color: PALETTE.moonGlow,
    roughness: 0.25,
    metalness: 0.3,
    emissive: PALETTE.moonGlow,
    emissiveIntensity: 0.5,
    opacity: 0.75,
  },

  gate: {
    color: PALETTE.moonGlow,
    roughness: 0.25,
    metalness: 0.9,
    emissive: PALETTE.moonGlow,
    emissiveIntensity: 0.45,
  },
} as const;

/* ── Motion Rules ────────────────────────────────────── */
export const MOTION_RULES = {
  timing: {
    fadeIn:  "0.0 – 1.0s",
    reveal:  "1.0 – 3.0s",
    peak:    "3.0 – 5.0s",
    settle:  "5.0 – 7.0s",
  },
  speed: "slow emotional motion only",

  breathing: {
    frequency: 1.4,
    amplitude: 0.03,
  },

  float: {
    frequency: 0.6,
    amplitude: 0.25,
  },

  forbidden: [
    "fast bounce (duration < 0.3s)",
    "spring animation (no physics bounce)",
    "game-style tween (< 0.5s snap)",
  ],
} as const;

/* ── Post-Processing Rules ───────────────────────────── */
export const POST_RULES = {
  bloom: {
    luminanceThreshold: 0.22,
    luminanceSmoothing: 0.85,
    intensity: 0.75,
    radius: 0.55,
  },
  vignette: {
    offset: 0.25,
    darkness: 0.42,
  },
  toneMapping: "ACESFilmic" as const,
  exposure: 1.1,
} as const;

/* ── Stars Rules ─────────────────────────────────────── */
export const STAR_RULES = {
  count: 160,
  spread: [26, 20, 18] as const,
  size: 0.045,
  opacity: 0.7,
  rotationSpeed: { y: 0.012, x: 0.003 },
  warmRatio: 0.6,
} as const;

/* ── Speech Rules ────────────────────────────────────── */
export const SPEECH_RULES = {
  fontSize: 0.22,
  color: PALETTE.moonGlow,
  outlineColor: PALETTE.warmGold,
  duration: 3,
  fadeInRatio: 0.15,
  holdRatio: 0.7,
  floatDistance: 0.5,
  cooldown: 8,
  idleInterval: { min: 20, max: 40 },
  distanceTrigger: 3.5,
} as const;

/* ── Compliance Checker ──────────────────────────────── */
export function checkCompliance(sceneConfig: Record<string, unknown>): string[] {
  const violations: string[] = [];

  if (sceneConfig.lightColor === "#FFFFFF") violations.push("LIGHT: pure white forbidden");
  if (sceneConfig.metalness && Number(sceneConfig.metalness) > 0.95) violations.push("MATERIAL: metalness too high");
  if (sceneConfig.cameraSpeed && Number(sceneConfig.cameraSpeed) > 0.3) violations.push("CAMERA: speed too fast");

  return violations;
}