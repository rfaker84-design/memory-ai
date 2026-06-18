// DigitalHumanReactionEngine.ts — V2 Real AI Face Reaction System
// Maps emotional states → facial expressions for digital human rendering.
// Simulates gaze tracking, micro head movements, and emotional response delay.

export type EmotionFace = "warm_smile" | "calm_neutral" | "sad_gentle" | "nostalgic_distant" | "attentive_listening" | "thinking_slight";

export interface FaceState {
  expression: EmotionFace;
  intensity: number;
  gazeX: number;
  gazeY: number;
  headTilt: number;
  blinkPhase: number;
  microMotionX: number;
  microMotionY: number;
  transitionProgress: number;
}

export interface ReactionConfig {
  responseDelayMs: number;
  gazeFollowStrength: number;
  blinkIntervalMs: number;
  microMotionAmplitude: number;
}

const DEFAULT_CONFIG: ReactionConfig = {
  responseDelayMs: 300, gazeFollowStrength: 0.3,
  blinkIntervalMs: 3500, microMotionAmplitude: 0.5,
};

export function emotionToFace(emotion: string): EmotionFace {
  switch (emotion) {
    case "warm": return "warm_smile";
    case "calm": return "calm_neutral";
    case "sad": return "sad_gentle";
    case "nostalgic": return "nostalgic_distant";
    case "listening": return "attentive_listening";
    case "thinking": return "thinking_slight";
    default: return "calm_neutral";
  }
}

export interface FaceTransform {
  scale: number; rotateX: number; rotateY: number;
  translateX: number; translateY: number;
  brightness: number; saturate: number; filter: string;
}

export function faceStateToTransform(state: FaceState): FaceTransform {
  const { expression, intensity, gazeX, gazeY, headTilt, microMotionX, microMotionY } = state;
  let scale = 1, brightness = 1, saturate = 1;
  let rotateX = 0, rotateY = gazeX * 3;

  switch (expression) {
    case "warm_smile":
      scale = 1 + intensity * 0.02; brightness = 1 + intensity * 0.1; saturate = 1 + intensity * 0.05; break;
    case "calm_neutral":
      scale = 1; brightness = 1; saturate = 0.95; break;
    case "sad_gentle":
      rotateX = intensity * -3; brightness = 1 - intensity * 0.08; saturate = 1 - intensity * 0.1; break;
    case "nostalgic_distant":
      rotateY = gazeX * 5 + intensity * 4; brightness = 1 + intensity * 0.05; saturate = 1 - intensity * 0.05; break;
    case "attentive_listening":
      scale = 1 + intensity * 0.03; rotateY = gazeX * 2; brightness = 1 + intensity * 0.05; break;
    case "thinking_slight":
      rotateX = intensity * -1.5; rotateY = gazeX * 1.5 + intensity * 2; brightness = 1 - intensity * 0.03; break;
  }
  return {
    scale, rotateX: rotateX + headTilt * 0.3, rotateY,
    translateX: microMotionX * 3, translateY: gazeY * 2 + microMotionY * 3,
    brightness, saturate,
    filter: "brightness(" + brightness + ") saturate(" + saturate + ")",
  };
}

export function simulateGaze(cursorX: number, cursorY: number, config: ReactionConfig): { gazeX: number; gazeY: number } {
  const dx = (cursorX - 0.5) * 2, dy = (cursorY - 0.5) * 2, deadZone = 0.15;
  return {
    gazeX: Math.abs(dx) < deadZone ? 0 : dx * config.gazeFollowStrength,
    gazeY: Math.abs(dy) < deadZone ? 0 : dy * config.gazeFollowStrength * 0.6,
  };
}

export function simulateBlink(elapsedMs: number, blinkIntervalMs: number): number {
  const cycle = elapsedMs % blinkIntervalMs, blinkDuration = 150;
  if (cycle < blinkDuration) { const t = cycle / blinkDuration; return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2; }
  return 0;
}

const motionSeed = Math.random() * 1000;
export function simulateMicroMotion(elapsedMs: number, amplitude: number): { x: number; y: number } {
  const t = elapsedMs * 0.001;
  return {
    x: Math.sin(t * 0.7 + motionSeed) * amplitude * 0.3 + Math.sin(t * 1.3 + motionSeed * 1.7) * amplitude * 0.2,
    y: Math.cos(t * 0.6 + motionSeed * 0.5) * amplitude * 0.25 + Math.cos(t * 1.1 + motionSeed * 2.1) * amplitude * 0.15,
  };
}

export interface LipSyncState { openness: number; frequency: number; }

export function simulateLipSync(isSpeaking: boolean, elapsedMs: number): LipSyncState {
  if (!isSpeaking) return { openness: 0.05, frequency: 0 };
  const t = elapsedMs * 0.001;
  return {
    openness: Math.min(1, 0.3 + Math.abs(Math.sin(t * 8)) * 0.5 + Math.abs(Math.sin(t * 14)) * 0.2),
    frequency: 3 + Math.sin(t * 2) * 1.5,
  };
}

export function updateReactionState(
  prev: FaceState, targetEmotion: string, cursorX: number, cursorY: number,
  isSpeaking: boolean, elapsedMs: number, config: ReactionConfig = DEFAULT_CONFIG,
): FaceState {
  const targetFace = emotionToFace(targetEmotion);
  const transitionSpeed = 0.05;
  const newTransition = prev.transitionProgress + (1 - prev.transitionProgress) * transitionSpeed;
  const expression = newTransition > 0.95 ? targetFace : prev.expression;
  const { gazeX, gazeY } = simulateGaze(cursorX, cursorY, config);
  const blinkPhase = simulateBlink(elapsedMs, config.blinkIntervalMs);
  const micro = simulateMicroMotion(elapsedMs, config.microMotionAmplitude);
  const lipSync = simulateLipSync(isSpeaking, elapsedMs);
  return {
    expression, intensity: prev.intensity + (0.5 - prev.intensity) * 0.1,
    gazeX, gazeY, headTilt: lipSync.openness * 1.5, blinkPhase,
    microMotionX: micro.x, microMotionY: micro.y,
    transitionProgress: newTransition,
  };
}

export function createInitialFaceState(): FaceState {
  return {
    expression: "calm_neutral", intensity: 0.3,
    gazeX: 0, gazeY: 0, headTilt: 0, blinkPhase: 0,
    microMotionX: 0, microMotionY: 0, transitionProgress: 1,
  };
}
