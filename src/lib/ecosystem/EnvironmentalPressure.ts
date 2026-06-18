// EnvironmentalPressureSystem.ts — External variables affecting ecosystem evolution
//
// Pressure sources:
//   - User visit frequency
//   - User emotional volatility
//   - Memory interaction density
//   - Ecosystem age / staleness

export interface PressureInput {
  totalInteractions: number;
  recentInteractionRate: number;   // interactions per hour (last 24h)
  userEmotionalVolatility: number; // 0-1, how much user emotion fluctuates
  ecosystemAge: number;            // hours since creation
  nodeCount: number;
  activeNodeRatio: number;        // nodes with energy > 0.3
}

export interface PressureOutput {
  environmentalPressure: number;  // 0-1
  evolutionSpeed: number;         // tick multiplier
  stabilityIndex: number;         // 0-1, how stable the ecosystem is
  dominantMode: "stable" | "evolving" | "volatile" | "collapsing";
}

export function computeEnvironmentalPressure(input: PressureInput): PressureOutput {
  // Base pressure from interaction density
  const interactionPressure = Math.min(1, input.recentInteractionRate * 3);

  // Emotional volatility adds instability
  const emotionPressure = input.userEmotionalVolatility * 0.5;

  // Ecosystem age: older ecosystems stabilize unless interacted with
  const ageFactor = Math.max(0.1, 1 - Math.min(input.ecosystemAge / 720, 0.9)); // decays over 30 days
  const stalenessPressure = (1 - ageFactor) * 0.6;

  // Node density pressure
  const densityPressure = Math.min(1, input.nodeCount / 50) * 0.3;

  // Combined pressure
  const environmentalPressure = Math.max(0.05, Math.min(1,
    interactionPressure * 0.4 + emotionPressure * 0.3 + stalenessPressure * 0.2 + densityPressure * 0.1,
  ));

  // Evolution speed: higher pressure = faster evolution
  const evolutionSpeed = 0.5 + environmentalPressure * 1.5;

  // Stability index
  const stabilityIndex = Math.max(0, Math.min(1,
    input.activeNodeRatio * 0.5 + ageFactor * 0.3 + (1 - input.userEmotionalVolatility) * 0.2,
  ));

  // Dominant mode
  let dominantMode: PressureOutput["dominantMode"] = "stable";
  if (environmentalPressure > 0.7) dominantMode = "volatile";
  else if (environmentalPressure > 0.45) dominantMode = "evolving";
  else if (stabilityIndex < 0.2) dominantMode = "collapsing";

  return { environmentalPressure, evolutionSpeed, stabilityIndex, dominantMode };
}

// ─── Interaction rate calculator ─────────────────────────────
export function computeRecentInteractionRate(
  interactionTimestamps: number[], // unix ms
  windowHours: number = 24,
): number {
  const cutoff = Date.now() - windowHours * 3600 * 1000;
  const recent = interactionTimestamps.filter(t => t > cutoff);
  return recent.length / windowHours;
}

// ─── Emotional volatility from history ───────────────────────
export function computeEmotionalVolatility(
  emotionHistory: Array<{ emotion: string; timestamp: number }>,
): number {
  if (emotionHistory.length < 3) return 0.3;

  // Count emotion transitions
  let transitions = 0;
  for (let i = 1; i < emotionHistory.length; i++) {
    if (emotionHistory[i].emotion !== emotionHistory[i - 1].emotion) {
      transitions++;
    }
  }
  return Math.min(1, transitions / Math.max(emotionHistory.length - 1, 1));
}
