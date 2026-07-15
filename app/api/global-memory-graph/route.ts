import { NextRequest } from "next/server";

import { legacyRouteUnavailable, legacyMutationUnavailable } from "../_legacy-unavailable";

export interface GlobalMemoryNode {
  memory_id: string; name: string; relationship: string; origin_user_id: string;
  emotional_weight: number; resonance_score: number; access_count: number;
  cluster_id: string | null;
  emotion_vector: { valence: number; arousal: number; dominance: number };
  life_story_snippet: string; is_trending: boolean; trending_velocity: number;
}

export interface GlobalCluster {
  cluster_id: string; label: string; theme: string; dominant_emotion: string;
  node_count: number; total_resonance: number; color: { hue: number; sat: number };
}

export interface GlobalMemoryStream {
  trending: GlobalMemoryNode[];
  emerging_clusters: GlobalCluster[];
  fading_memories: { memory_id: string; name: string; days_since_access: number }[];
  global_stats: { total_memories: number; total_resonance: number; active_users_24h: number; peak_emotion: string };
  generated_at: number;
}

export async function GET() {
  return legacyRouteUnavailable();
}

export async function PATCH(request: NextRequest) {
  return legacyMutationUnavailable(request);
}
