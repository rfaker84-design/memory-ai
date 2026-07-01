export type EmotionType =
  | "neutral"
  | "sad"
  | "grief"
  | "lonely"
  | "anxious"
  | "angry"
  | "hopeful"
  | "warm";

export type EmotionIntensity = "low" | "medium" | "high";

export interface EmotionDetectionInput {
  userId: string;
  memoryId: string;
  sessionId: string;
  userMessage: string;
  recentMessages?: { role: string; content: string }[];
}

export interface EmotionDetectionResult {
  emotion: EmotionType;
  intensity: EmotionIntensity;
  keywords: string[];
}

export type CompanionMode =
  | "comfort"
  | "listen"
  | "encourage"
  | "memory"
  | "guide";

export interface AIEmotionState {
  emotion: EmotionType;
  intensity: EmotionIntensity;
  responseStyle: string;
  companionMode: CompanionMode;
}

export interface EmotionContext {
  emotion: EmotionType;
  intensity: EmotionIntensity;
  suggestedTone: string;
  previousEmotion?: EmotionType;
  trend?: string;
  aiEmotionState: AIEmotionState;
}
