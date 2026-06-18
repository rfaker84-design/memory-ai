/* ============================================================
   忆见 MemoryAI — Cinematic Camera Controller V1
   Film-grade shot system · Auto-narrative rhythm · AI attraction
   ============================================================ */

import * as THREE from "three";
import type { EmotionState } from "../visual-ai-controller";

/* ── Shot Types ─────────────────────────────────────────── */
export type CinematicShot =
  | "INTRO"
  | "DRIFT"
  | "APPROACH"
  | "MEMORY_FOCUS"
  | "EMOTION_PULSE";

/* ── Camera State ───────────────────────────────────────── */
export interface CameraState {
  shot: CinematicShot;
  shotElapsed: number;
  totalElapsed: number;
  position: THREE.Vector3;
  lookTarget: THREE.Vector3;
  fov: number;
  dofBlur: number;          // 0=sharp, 1=blurred background
  velocity: THREE.Vector3;
  targetVelocity: THREE.Vector3;
}

/* ── Shot Timeline ──────────────────────────────────────── */
export interface ShotTimeline {
  shot: CinematicShot;
  startAt: number;          // seconds
  duration: number;         // seconds
  easeIn: number;           // seconds to ease into shot
}

/* ── Camera Parameters per Shot ─────────────────────────── */
export interface ShotParams {
  baseSpeed: number;        // forward drift speed
  floatAmplitude: number;   // Y oscillation
  swayAmplitude: number;    // X oscillation
  fov: number;
  dofBlur: number;
  entityAttraction: number; // 0-1, how strongly pulled toward entities
  zRange: [number, number]; // [min, max] Z position
  description: string;
}

/* ── Default Timeline ───────────────────────────────────── */
export const DEFAULT_TIMELINE: ShotTimeline[] = [
  { shot: "INTRO",         startAt: 0,  duration: 4,  easeIn: 1.5 },
  { shot: "DRIFT",         startAt: 4,  duration: 6,  easeIn: 2.0 },
  { shot: "APPROACH",      startAt: 10, duration: 8,  easeIn: 2.0 },
  { shot: "MEMORY_FOCUS",  startAt: 18, duration: 12, easeIn: 2.5 },
  { shot: "EMOTION_PULSE", startAt: 30, duration: 999, easeIn: 3.0 },
];

/* ── Shot Parameters ────────────────────────────────────── */
export const SHOT_PARAMS: Record<CinematicShot, ShotParams> = {
  INTRO: {
    baseSpeed: 0.04, floatAmplitude: 0.06, swayAmplitude: 0.03,
    fov: 54, dofBlur: 0.8, entityAttraction: 0.1,
    zRange: [8.5, 7.5], description: "Slow fade-in, distant universe reveal",
  },
  DRIFT: {
    baseSpeed: 0.07, floatAmplitude: 0.10, swayAmplitude: 0.05,
    fov: 52, dofBlur: 0.5, entityAttraction: 0.3,
    zRange: [7.5, 6.5], description: "Slow floating, slight parallax",
  },
  APPROACH: {
    baseSpeed: 0.10, floatAmplitude: 0.08, swayAmplitude: 0.06,
    fov: 50, dofBlur: 0.3, entityAttraction: 0.6,
    zRange: [6.5, 4.5], description: "Camera moves toward nearest entity",
  },
  MEMORY_FOCUS: {
    baseSpeed: 0.05, floatAmplitude: 0.04, swayAmplitude: 0.03,
    fov: 46, dofBlur: 0.15, entityAttraction: 0.9,
    zRange: [5.0, 3.5], description: "Locks onto AI, background blurs",
  },
  EMOTION_PULSE: {
    baseSpeed: 0.03, floatAmplitude: 0.05, swayAmplitude: 0.04,
    fov: 48, dofBlur: 0.2, entityAttraction: 0.7,
    zRange: [4.5, 3.0], description: "Breathing zoom, emotional pulse",
  },
};

/* ── Create Camera State ────────────────────────────────── */
export function createCameraState(): CameraState {
  return {
    shot: "INTRO",
    shotElapsed: 0,
    totalElapsed: 0,
    position: new THREE.Vector3(0, 0.4, 8.5),
    lookTarget: new THREE.Vector3(0, 0.1, -0.5),
    fov: 54,
    dofBlur: 0.8,
    velocity: new THREE.Vector3(0, 0, 0),
    targetVelocity: new THREE.Vector3(0, 0, 0),
  };
}

/* ── Get current shot from timeline ──────────────────────── */
export function getCurrentShot(
  elapsed: number,
  timeline: ShotTimeline[] = DEFAULT_TIMELINE,
): { shot: CinematicShot; params: ShotParams; progress: number; easingProgress: number } {
  let activeShot: ShotTimeline | null = null;

  for (let i = timeline.length - 1; i >= 0; i--) {
    if (elapsed >= timeline[i].startAt) {
      activeShot = timeline[i];
      break;
    }
  }

  if (!activeShot) activeShot = timeline[0];

  const progress = Math.min(1, (elapsed - activeShot.startAt) / activeShot.duration);
  const easingProgress = activeShot.easeIn > 0
    ? Math.min(1, (elapsed - activeShot.startAt) / activeShot.easeIn)
    : 1;
  // Smooth ease-in-out
  const eased = easingProgress < 0.5
    ? 2 * easingProgress * easingProgress
    : 1 - Math.pow(-2 * easingProgress + 2, 2) / 2;

  return {
    shot: activeShot.shot,
    params: { ...SHOT_PARAMS[activeShot.shot] },
    progress,
    easingProgress: eased,
  };
}

/* ── Entity Attraction (camera pulled toward nearest entity) ── */
export function computeEntityAttraction(
  cameraPos: THREE.Vector3,
  entityPositions: Record<string, THREE.Vector3>,
  attractionStrength: number,
): THREE.Vector3 {
  if (attractionStrength <= 0 || Object.keys(entityPositions).length === 0) {
    return new THREE.Vector3();
  }

  // Find nearest entity
  let nearestDist = Infinity;
  let nearestPos = new THREE.Vector3();

  for (const pos of Object.values(entityPositions)) {
    const d = cameraPos.distanceTo(pos);
    if (d < nearestDist) {
      nearestDist = d;
      nearestPos = pos.copy(pos);
    }
  }

  // Also find second-nearest for weighted blend
  let secondDist = Infinity;
  let secondPos = new THREE.Vector3();
  for (const pos of Object.values(entityPositions)) {
    const d = cameraPos.distanceTo(pos);
    if (d > nearestDist + 0.1 && d < secondDist) {
      secondDist = d;
      secondPos = pos.copy(pos);
    }
  }

  // Blend toward nearest, slight pull toward second
  const dirToNearest = new THREE.Vector3().subVectors(nearestPos, cameraPos).normalize();
  const attraction = dirToNearest.multiplyScalar(attractionStrength * 0.3);

  if (secondDist < Infinity) {
    const dirToSecond = new THREE.Vector3().subVectors(secondPos, cameraPos).normalize();
    attraction.add(dirToSecond.multiplyScalar(attractionStrength * 0.1));
  }

  return attraction;
}

/* ── Emotion → Camera Modifier ──────────────────────────── */
export function emotionToCameraMod(emotion: EmotionState): {
  speedMul: number;
  floatAmpMul: number;
  dofShift: number;
} {
  switch (emotion) {
    case "calm":    return { speedMul: 1.0, floatAmpMul: 1.0, dofShift: 0 };
    case "memory":  return { speedMul: 0.6, floatAmpMul: 0.7, dofShift: 0.05 };
    case "sad":     return { speedMul: 0.4, floatAmpMul: 0.5, dofShift: 0.1 };
    case "happy":   return { speedMul: 1.3, floatAmpMul: 1.3, dofShift: -0.05 };
    case "thinking":return { speedMul: 0.8, floatAmpMul: 1.1, dofShift: 0.02 };
  }
}

/* ── Smooth Damp ────────────────────────────────────────── */
export function smoothDamp(
  current: number,
  target: number,
  velocity: { value: number },
  smoothTime: number,
  maxSpeed: number,
  deltaTime: number,
): number {
  smoothTime = Math.max(0.0001, smoothTime);
  const omega = 2 / smoothTime;
  const x = omega * deltaTime;
  const exp = 1 / (1 + x + 0.48 * x * x + 0.235 * x * x * x);
  let change = current - target;
  const maxChange = maxSpeed * smoothTime;
  change = Math.max(-maxChange, Math.min(maxChange, change));
  const temp = (velocity.value + omega * change) * deltaTime;
  velocity.value = (velocity.value - omega * temp) * exp;
  const result = target + (change + temp) * exp;
  if ((target - current > 0) === (result > target)) {
    return target;
  }
  return result;
}

/* ── Full Camera Update (call every frame) ───────────────── */
export function updateCinematicCamera(
  state: CameraState,
  deltaSeconds: number,
  entityPositions: Record<string, THREE.Vector3>,
  emotion: EmotionState,
  parallaxX: number,
  parallaxY: number,
): CameraState {
  state.totalElapsed += deltaSeconds;
  state.shotElapsed += deltaSeconds;

  // Get current shot
  const { shot, params, easingProgress } = getCurrentShot(state.totalElapsed);
  const emMod = emotionToCameraMod(emotion);

  // Shot transition
  if (shot !== state.shot) {
    state.shot = shot;
    state.shotElapsed = 0;
  }

  // Base forward drift
  const speed = params.baseSpeed * emMod.speedMul * easingProgress;
  state.targetVelocity.z = -speed;

  // Float + sway oscillation
  const floatFreq = 0.25;
  const swayFreq = 0.18;
  const floatAmp = params.floatAmplitude * emMod.floatAmpMul;
  const swayAmp = params.swayAmplitude;
  const targetY = 0.4 + Math.sin(state.totalElapsed * floatFreq) * floatAmp + parallaxY * 0.5;
  const targetX = Math.sin(state.totalElapsed * swayFreq) * swayAmp + parallaxX * 0.7;

  // Entity attraction
  const attraction = computeEntityAttraction(state.position, entityPositions, params.entityAttraction);
  state.targetVelocity.x += attraction.x * 0.3;
  state.targetVelocity.y += attraction.y * 0.3;

  // Smooth velocity
  const smoothTime = 2.5;
  const maxSpeed = 0.5;
  const velX = { value: state.velocity.x };
  const velY = { value: state.velocity.y };
  const velZ = { value: state.velocity.z };

  state.velocity.x = smoothDamp(state.velocity.x, state.targetVelocity.x, velX, smoothTime, maxSpeed, deltaSeconds);
  state.velocity.y = smoothDamp(state.velocity.y, state.targetVelocity.y, velY, smoothTime, maxSpeed, deltaSeconds);
  state.velocity.z = smoothDamp(state.velocity.z, state.targetVelocity.z, velZ, smoothTime, maxSpeed, deltaSeconds);

  // Apply velocity to position
  state.position.x += state.velocity.x * deltaSeconds;
  state.position.y += state.velocity.y * deltaSeconds;
  state.position.z += state.velocity.z * deltaSeconds;

  // Clamp Z range
  state.position.z = Math.max(params.zRange[1], Math.min(params.zRange[0], state.position.z));

  // Look target: blend between center focus and entity focus
  const centerLook = new THREE.Vector3(0, 0.1, -0.5);
  if (Object.keys(entityPositions).length > 0 && params.entityAttraction > 0.3) {
    // Find nearest entity for look target
    let nearestDist = Infinity;
    let nearestPos = new THREE.Vector3();
    for (const pos of Object.values(entityPositions)) {
      const d = state.position.distanceTo(pos);
      if (d < nearestDist) { nearestDist = d; nearestPos = pos.clone(); }
    }
    const entityWeight = Math.min(1, params.entityAttraction);
    state.lookTarget.lerpVectors(centerLook, nearestPos, entityWeight * 0.4);
  } else {
    state.lookTarget.copy(centerLook);
  }

  // DOF + FOV smoothing
  state.fov += (params.fov - state.fov) * 0.03;
  state.dofBlur += ((params.dofBlur + emMod.dofShift) - state.dofBlur) * 0.03;

  return state;
}
