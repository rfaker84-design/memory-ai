import { legacyRouteUnavailable } from "@/app/api/_legacy-unavailable";

export interface MemoryRelation {
  fromId: string;
  toId: string;
  relationType: "family" | "emotional" | "contrast" | "support";
  strength: number;
  label: string;
}

export interface MemoryCluster {
  clusterId: string;
  name: string;
  memberIds: string[];
  dominantEmotion: string;
}

export interface MemoryNetwork {
  focusId: string;
  relatedMemories: Array<{
    id: string;
    name: string;
    relationship: string;
    emotionalWeight: number;
  }>;
  relations: MemoryRelation[];
  clusters: MemoryCluster[];
  generatedAt: number;
}

export const GET = legacyRouteUnavailable;
