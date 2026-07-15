import {
  legacyMutationUnavailable,
  legacyRouteUnavailable,
} from "@/app/api/_legacy-unavailable";

export interface ConsciousnessNode {
  id: string;
  name: string;
  relationship: string;
  type: "memory" | "merged_cluster" | "core";
  emotional_vector: {
    valence: number;
    arousal: number;
    dominance: number;
  };
  coherence: number;
  intensity: number;
  position: { x: number; y: number };
  velocity: { vx: number; vy: number };
  radius: number;
  merged_from?: string[];
  lifecycle: "emerging" | "active" | "merging" | "fading" | "dissolved";
  glow_color: string;
}

export interface ConsciousnessField {
  nodes: ConsciousnessNode[];
  core_node: ConsciousnessNode | null;
  convergence_index: number;
  coherence_index: number;
  emotional_density_map: number[][];
  dominant_emotion: string;
  ai_insight: string;
  generated_at: number;
}

export const GET = legacyRouteUnavailable;
export const PATCH = legacyMutationUnavailable;
