export interface MemoryEngineInput {
  userId: string;
  memoryId: string;
  sessionId: string;
  userMessage: string;
}

export interface MemoryEngineContext {
  memoryId: string;
  userId: string;
  sessionId: string;
  userMessage: string;
  memoryName: string;
  relationship: string;
  lifeStory?: string | null;
  speechStyle?: string | null;
  birthYear?: number | null;
  deathYear?: number | null;
  valuesBelief?: string | null;
  personalityType?: string | null;
  fragments: string[];
  timeline: string[];
  history: string[];
  recentMessages: { role: string; content: string }[];
  emotion: string;
  emotionIntensity: string;
  suggestedTone: string;
  aiCompanionMode: string;
  aiResponseStyle: string;
  longTermMemories: string[];
}

export interface MemoryEngineResponse {
  content: string;
}
