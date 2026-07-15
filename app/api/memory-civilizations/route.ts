import { legacyRouteUnavailable } from "@/app/api/_legacy-unavailable";

export interface Civilization {
  civilization_id: string;
  name: string;
  dominant_emotion: string;
  memory_count: number;
  memory_ids: string[];
  cultural_pattern: string;
  culture: {
    tone: string;
    color_palette: string[];
    expression_style: string;
  };
  stability_index: number;
  evolution_stage: "growing" | "stable" | "declining" | "merging";
  spatial_center: { x: number; y: number };
  connection_edges: Array<{
    to_civilization_id: string;
    relation: string;
    strength: number;
  }>;
  member_previews: Array<{
    memory_id: string;
    name: string;
    relationship: string;
  }>;
  created_at: number;
}

export interface CivilizationMap {
  civilizations: Civilization[];
  global_stats: {
    total_civilizations: number;
    total_memories: number;
    dominant_culture: string;
    network_density: number;
  };
  ai_recommendation: {
    recommended_civilization: string;
    reason: string;
  };
  generated_at: number;
}

export const GET = legacyRouteUnavailable;
