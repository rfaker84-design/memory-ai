import { NextRequest } from "next/server";

import { legacyRouteUnavailable, legacyMutationUnavailable } from "../_legacy-unavailable";

export interface PersonalityCore {
  tone: "warm" | "calm" | "nostalgic" | "gentle";
  familiarity: number; trust: number; emotionalBias: number; expressiveness: number;
}

export interface RelationshipState {
  closeness: number; dependency: number; familiarity: number; lastInteraction: number;
  totalInteractions: number; summaryMemory: string;
}

export interface PersonalityState {
  memoryId: string; personality: PersonalityCore; relationship: RelationshipState;
  interactionHighlights: Array<{ at: number; emotion: string; summary: string }>;
  lastUpdated: number;
}

export async function GET() {
  return legacyRouteUnavailable();
}

export async function PATCH(request: NextRequest) {
  return legacyMutationUnavailable(request);
}
