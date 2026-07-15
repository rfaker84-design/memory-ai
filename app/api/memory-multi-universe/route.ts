import { NextRequest } from "next/server";

import { legacyRouteUnavailable, legacyMutationUnavailable } from "../_legacy-unavailable";

export interface UniverseClusterNode {
  memory_id: string; name: string; relationship: string; emotional_weight: number;
  creator_weight: number; viewer_influence: number; emotional_resonance: number;
  spatial_position: { x: number; y: number; z: number };
  interaction_count: number; last_interaction: number; shared_by?: string[];
  comments?: { user: string; text: string; emotion: string; at: number }[];
  reactions?: { user: string; emotion: string; at: number }[];
}

export interface EmotionLayer {
  userId: string; attachment: number; curiosity: number; sadness: number;
  dominant: string; intensity: number;
}

export interface UniverseEntry {
  universe_id: string; type: "personal" | "family" | "shared"; label: string;
  emotional_archetype: string; spatial_model: string; gravity_logic: string;
  nodes: UniverseClusterNode[]; memberCount: number; color: { hue: number; sat: number };
}

export interface MultiUniverseState {
  user_phone: string; universes: UniverseEntry[];
  family_graph: {
    edges: { from: string; to: string; relation: string; strength: number }[];
    groups: { id: string; name: string; memberIds: string[] }[];
  };
  emotion_field: { layers: EmotionLayer[]; blended: EmotionLayer };
  generated_at: number;
}

export async function GET() {
  return legacyRouteUnavailable();
}

export async function PATCH(request: NextRequest) {
  return legacyMutationUnavailable(request);
}
