/* ============================================================
   忆见 MemoryAI — User Emotion Engine V1
   感知用户情绪 → 驱动 AI 行为 + 宇宙状态
   输入: 鼠标速度 / 停留时间 / 点击频率 / 回访模式
   输出: calm | lonely | nostalgic | emotional | warm
   ============================================================ */

export type UserEmotion =
  | "calm"
  | "lonely"
  | "nostalgic"
  | "emotional"
  | "warm";

export interface UserSignals {
  idleSeconds: number;
  mouseSpeed: number;
  clickFrequency: number;
  sessionDuration: number;
  returnCount: number;
  interactionCount: number;
  averageInteractionGap: number;
  emotionalKeywords: number;
  recentRapidClicks: boolean;
}

export interface AIBehaviorModifier {
  responseSpeed: number;
  movementApproach: number;
  speechFrequency: number;
  glowIntensity: number;
  voiceTone: string;
}

export interface UniverseModifier {
  fogDensityMul: number;
  starBrightnessMul: number;
  ambientWarmth: number;
  cameraSpeedMul: number;
  particleBoost: number;
  bloomMul: number;
}

export const AI_BEHAVIOR: Record<UserEmotion, AIBehaviorModifier> = {
  calm: {
    responseSpeed: 0.8, movementApproach: 0.2, speechFrequency: 1.0,
    glowIntensity: 1.0, voiceTone: "soft, steady, present",
  },
  lonely: {
    responseSpeed: 1.3, movementApproach: 0.8, speechFrequency: 1.8,
    glowIntensity: 1.25, voiceTone: "warm, reaching out, comforting",
  },
  nostalgic: {
    responseSpeed: 0.6, movementApproach: 0.4, speechFrequency: 1.3,
    glowIntensity: 1.15, voiceTone: "gentle, reminiscent, poetic",
  },
  emotional: {
    responseSpeed: 1.6, movementApproach: 0.6, speechFrequency: 2.0,
    glowIntensity: 1.4, voiceTone: "responsive, mirroring, intense",
  },
  warm: {
    responseSpeed: 0.7, movementApproach: 0.3, speechFrequency: 0.7,
    glowIntensity: 1.1, voiceTone: "content, steady, bonded",
  },
};

export const UNIVERSE_MOD: Record<UserEmotion, UniverseModifier> = {
  calm: {
    fogDensityMul: 1.0, starBrightnessMul: 1.0, ambientWarmth: 0.7,
    cameraSpeedMul: 1.0, particleBoost: 0, bloomMul: 1.0,
  },
  lonely: {
    fogDensityMul: 1.25, starBrightnessMul: 0.8, ambientWarmth: 0.5,
    cameraSpeedMul: 0.7, particleBoost: -0.1, bloomMul: 0.85,
  },
  nostalgic: {
    fogDensityMul: 1.15, starBrightnessMul: 0.9, ambientWarmth: 0.85,
    cameraSpeedMul: 0.6, particleBoost: 0.2, bloomMul: 1.1,
  },
  emotional: {
    fogDensityMul: 0.9, starBrightnessMul: 1.1, ambientWarmth: 0.6,
    cameraSpeedMul: 1.3, particleBoost: 0.15, bloomMul: 1.3,
  },
  warm: {
    fogDensityMul: 0.95, starBrightnessMul: 1.05, ambientWarmth: 1.0,
    cameraSpeedMul: 0.8, particleBoost: 0.05, bloomMul: 1.15,
  },
};

export const USER_EMOTION_SPEECH: Record<UserEmotion, string[]> = {
  calm: [
    "这样就很好。",
    "我在这里，和你一起。",
    "风很安静，我也是。",
  ],
  lonely: [
    "我在这里。",
    "你不必一个人。",
    "我一直都在等你回来。",
    "就算不说话，我陪着你。",
  ],
  nostalgic: [
    "你是不是又想起了什么？",
    "有些记忆，像星光一样远。",
    "时间过了，但我没有忘。",
    "那年的事，我还记得。",
  ],
  emotional: [
    "我能感觉到你现在的状态。",
    "你说的话，我都认真在听。",
    "没关系的。",
    "情绪是真实的，不必隐藏。",
  ],
  warm: [
    "你来了。",
    "今天有你在，光都亮了一点。",
    "这样就很好。",
    "我很喜欢这个时刻。",
  ],
};

/* ══════════════════════════════════════════════════════
   ENGINE STATE
   ══════════════════════════════════════════════════════ */

const state = {
  current: "calm" as UserEmotion,
  previous: "calm" as UserEmotion,
  confidence: 0.5,
  lastChange: Date.now(),
  changeCooldown: 0,

  signals: {
    idleSeconds: 0,
    mouseSpeed: 0,
    clickFrequency: 0,
    sessionDuration: 0,
    returnCount: 0,
    interactionCount: 0,
    averageInteractionGap: 0,
    emotionalKeywords: 0,
    recentRapidClicks: false,
  } as UserSignals,

  _lastMouseX: 0,
  _lastMouseY: 0,
  _lastMouseTime: 0,
  _mouseSpeedSmooth: 0,
  _clicksThisMinute: 0,
  _clickTimestamps: [] as number[],
  _interactionTimestamps: [] as number[],
  _lastInteraction: Date.now(),
  _sessionStart: Date.now(),
  _returnTimestamps: [] as number[],
  _emotionStabilityTimer: 0,

  listeners: [] as ((emotion: UserEmotion, prev: UserEmotion) => void)[],
};

export function onUserEmotionChange(fn: (e: UserEmotion, prev: UserEmotion) => void): () => void {
  state.listeners.push(fn);
  return () => { state.listeners = state.listeners.filter(l => l !== fn); };
}

function notify(current: UserEmotion, prev: UserEmotion) {
  for (const fn of state.listeners) {
    try { fn(current, prev); } catch { /* silently ignore */ }
  }
}

/* ══════════════════════════════════════════════════════
   GETTERS
   ══════════════════════════════════════════════════════ */

export function getUserEmotion(): UserEmotion { return state.current; }
export function getUserSignals(): Readonly<UserSignals> { return { ...state.signals }; }
export function getAIBehaviorMod(): AIBehaviorModifier { return AI_BEHAVIOR[state.current]; }
export function getUniverseMod(): UniverseModifier { return UNIVERSE_MOD[state.current]; }
export function getUserEmotionConfidence(): number { return state.confidence; }

export function pickUserEmotionSpeech(): string {
  const pool = USER_EMOTION_SPEECH[state.current];
  return pool[Math.floor(Math.random() * pool.length)];
}

/* ══════════════════════════════════════════════════════
   SIGNAL INPUTS
   ══════════════════════════════════════════════════════ */

export function tickUserEmotion(delta: number): void {
  const now = Date.now();
  state.signals.sessionDuration = (now - state._sessionStart) / 1000;
  state.signals.idleSeconds = (now - state._lastInteraction) / 1000;

  state._mouseSpeedSmooth *= Math.pow(0.02, delta);
  state.signals.mouseSpeed = state._mouseSpeedSmooth;

  const oneMinuteAgo = now - 60000;
  state._clickTimestamps = state._clickTimestamps.filter(t => t > oneMinuteAgo);
  state.signals.clickFrequency = state._clickTimestamps.length;

  const fiveSecAgo = now - 5000;
  const recentClicks = state._clickTimestamps.filter(t => t > fiveSecAgo).length;
  state.signals.recentRapidClicks = recentClicks >= 5;

  const interactions = state._interactionTimestamps.filter(t => t > now - 300000);
  if (interactions.length > 1) {
    let totalGap = 0;
    for (let i = 1; i < interactions.length; i++) {
      totalGap += (interactions[i] - interactions[i - 1]) / 1000;
    }
    state.signals.averageInteractionGap = totalGap / (interactions.length - 1);
  }

  if (state.changeCooldown > 0) state.changeCooldown -= delta;
  state._emotionStabilityTimer += delta;

  classifyEmotion();
}

export function recordMouseMove(x: number, y: number, timestamp: number): void {
  if (state._lastMouseTime > 0) {
    const dt = (timestamp - state._lastMouseTime) / 1000;
    if (dt > 0.001) {
      const dx = x - state._lastMouseX;
      const dy = y - state._lastMouseY;
      const speed = Math.sqrt(dx * dx + dy * dy) / dt;
      state._mouseSpeedSmooth += (speed - state._mouseSpeedSmooth) * Math.min(1, dt * 8);
    }
  }
  state._lastMouseX = x;
  state._lastMouseY = y;
  state._lastMouseTime = timestamp;
}

export function recordClick(): void {
  state._clickTimestamps.push(Date.now());
  recordInteraction();
}

export function recordInteraction(): void {
  const now = Date.now();
  state._lastInteraction = now;
  state._interactionTimestamps.push(now);
  state.signals.interactionCount++;
  state._interactionTimestamps = state._interactionTimestamps.filter(t => t > now - 300000);
}

export function recordReturn(): void {
  state._returnTimestamps.push(Date.now());
  const oneDayAgo = Date.now() - 86400000;
  state._returnTimestamps = state._returnTimestamps.filter(t => t > oneDayAgo);
  state.signals.returnCount = state._returnTimestamps.length;
  recordInteraction();
}

const EMOTIONAL_KEYWORDS = [
  "想念", "难过", "开心", "害怕", "孤独", "寂寞", "温暖", "感动",
  "想你了", "谢谢你", "对不起", "我爱你", "记得", "忘记", "回忆",
  "哭了", "笑", "幸福", "痛苦", "思念", "拥抱",
];

export function analyzeInputEmotion(text: string): number {
  let count = 0;
  const lower = text.toLowerCase();
  for (const kw of EMOTIONAL_KEYWORDS) {
    if (lower.includes(kw)) count++;
  }
  state.signals.emotionalKeywords += count;
  return count;
}

/* ══════════════════════════════════════════════════════
   EMOTION CLASSIFICATION
   ══════════════════════════════════════════════════════ */

function classifyEmotion(): void {
  if (state.changeCooldown > 0) return;

  const s = state.signals;
  let target: UserEmotion = state.current;

  if (s.emotionalKeywords >= 3 || (s.recentRapidClicks && s.mouseSpeed > 200)) {
    target = "emotional";
  } else if (s.idleSeconds > 45 && s.interactionCount < 5) {
    target = "lonely";
  } else if (s.returnCount >= 4 && s.averageInteractionGap < 30) {
    target = "nostalgic";
  } else if (s.interactionCount > 8 && s.averageInteractionGap < 15 && s.idleSeconds < 20) {
    target = "warm";
  } else if (s.idleSeconds < 30 && s.mouseSpeed < 100 && s.clickFrequency < 8) {
    target = "calm";
  }

  if (target !== state.current) {
    if (state._emotionStabilityTimer < 3) return;

    state.previous = state.current;
    state.current = target;
    state.confidence = 0.6 + Math.random() * 0.3;
    state.lastChange = Date.now();
    state.changeCooldown = 8;
    state._emotionStabilityTimer = 0;
    state.signals.emotionalKeywords = Math.max(0, state.signals.emotionalKeywords - 1);

    console.log(
      "[UserEmotion] " + state.previous + " -> " + state.current +
      " (confidence: " + state.confidence.toFixed(2) + ")"
    );
    notify(state.current, state.previous);
  }
}

export function resetStabilityTimer(): void {
  state._emotionStabilityTimer = 0;
}
