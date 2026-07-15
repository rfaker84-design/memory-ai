import { NextRequest } from "next/server";

import { legacyRouteUnavailable, legacyMutationUnavailable } from "../_legacy-unavailable";

export interface EvoNode {
  id: string; name: string; relationship: string; x: number; y: number;
  vx: number; vy: number; mass: number; energy: number; mutationStage: number;
  clusterTag: string | null;
  connections: Array<{ to: string; strength: number; type: string }>;
}

export interface EcosystemState {
  focusId: string; nodes: EvoNode[]; environmentalPressure: number;
  evolutionSpeed: number; tick: number; lastMutation: string | null; generatedAt: number;
}

export async function GET() {
  return legacyRouteUnavailable();
}

export async function PATCH(request: NextRequest) {
  return legacyMutationUnavailable(request);
}
