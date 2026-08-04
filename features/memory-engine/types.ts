export interface MemoryEngineRouteContext {
  memoryName?: string;
  relationship?: string;
  lifeStory?: string | null;
  personalityProfile?: string | null;
  speechStyle?: string | null;
  catchPhrases?: string | null;
  fragments?: string[];
  timeline?: string[];
  recentMessages?: { role: string; content: string }[];
}

export interface MemoryEngineInput {
  userId: string;
  memoryId: string;
  sessionId: string;
  userMessage: string;
  routeContext?: MemoryEngineRouteContext;
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
  personalityProfile?: string | null;
  catchPhrases?: string | null;
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
  /** Owner-confirmed “拾忆” records supplied to the model for this turn. */
  confirmedPickupSources: ConfirmedMemorySource[];
}

export interface ConfirmedMemorySource {
  id: string;
  sourceKind: "user_confirmed_pickup";
}

export interface MemoryEngineResponse {
  content: string;
  /** Source IDs explicitly selected from this turn's owner-bound allowlist. */
  confirmedPickupSources?: ConfirmedMemorySource[];
}
