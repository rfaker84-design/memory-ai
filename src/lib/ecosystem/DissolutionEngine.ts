// DissolutionEngine.ts — V8 System Self-Dissolution
//
// Inverse of EvolutionEngine: structures lose coherence over time.
// stability → 0, coherence → 0, integrity → fragments
//
// Key principle: graceful degradation, never crash.

export interface DissolutionNode {
  id: string; name: string;
  x: number; y: number;
  vx: number; vy: number;
  opacity: number;          // 1 → 0 over time
  coherence: number;         // 1 → 0: how "solid" this node feels
  stability: number;         // 1 → 0: resistance to drift
  connections: Array<{ to: string; strength: number; type: string }>;
  dissolved: boolean;        // true = removed from render
}

export interface DissolutionState {
  focusId: string;
  nodes: DissolutionNode[];
  systemCoherence: number;   // 1 → 0: global structural integrity
  decayRate: number;          // how fast things fall apart
  tick: number;
  elapsedMs: number;          // time since dissolution began
  phase: "stable" | "drifting" | "fragmenting" | "dissolving" | "void";
  lastEvent: string | null;
}

// ─── Phase thresholds ───────────────────────────────────────
const PHASE_THRESHOLDS: Array<{ phase: DissolutionState["phase"]; min: number }> = [
  { phase: "stable", min: 0.85 },
  { phase: "drifting", min: 0.55 },
  { phase: "fragmenting", min: 0.3 },
  { phase: "dissolving", min: 0.1 },
  { phase: "void", min: 0 },
];

function computePhase(coherence: number): DissolutionState["phase"] {
  for (const t of PHASE_THRESHOLDS) {
    if (coherence >= t.min) return t.phase;
  }
  return "void";
}

// ─── Build initial state from existing ecosystem nodes ──────
export function initDissolution(
  focusId: string,
  evoNodes: Array<{
    id: string; name: string; x: number; y: number;
    connections: Array<{ to: string; strength: number; type: string }>;
  }>,
): DissolutionState {
  const nodes: DissolutionNode[] = evoNodes.map(n => ({
    id: n.id,
    name: n.name,
    x: n.x, y: n.y,
    vx: 0, vy: 0,
    opacity: 1,
    coherence: 0.85 + Math.random() * 0.15,
    stability: 0.7 + Math.random() * 0.3,
    connections: n.connections.map(c => ({ ...c })),
    dissolved: false,
  }));

  return {
    focusId,
    nodes,
    systemCoherence: 1,
    decayRate: 0.0003 + Math.random() * 0.0004, // very slow decay
    tick: 0,
    elapsedMs: 0,
    phase: "stable",
    lastEvent: null,
  };
}

// ─── Core dissolution tick ──────────────────────────────────
export function dissolveTick(
  state: DissolutionState,
  dtMs: number,
  userPresent: boolean,
): DissolutionState {
  const dt = dtMs / 1000;
  const events: string[] = [];
  let phaseChanged = false;

  // 1. Global decay
  const decayThisTick = state.decayRate * dt * 60; // normalized to 60fps
  const userDecayFactor = userPresent ? 0.3 : 1; // user presence slows decay
  const newCoherence = Math.max(0, state.systemCoherence - decayThisTick * userDecayFactor);

  const prevPhase = state.phase;
  const newPhase = computePhase(newCoherence);
  if (newPhase !== prevPhase) {
    phaseChanged = true;
    events.push(`Phase shift: ${prevPhase} → ${newPhase}`);
  }

  // 2. Per-node dissolution
  const nextNodes = state.nodes.map(node => {
    if (node.dissolved) return node;

    let { x, y, vx, vy, opacity, coherence, stability, connections } = node;

    // Drift increases as stability drops
    const driftForce = (1 - stability) * state.decayRate * 800 * dt;
    vx += (Math.random() - 0.5) * driftForce;
    vy += (Math.random() - 0.5) * driftForce;

    // Stability decays
    stability = Math.max(0, stability - decayThisTick * (0.5 + Math.random() * 0.5));

    // Coherence decays with system
    coherence = Math.max(0, coherence - decayThisTick * (0.3 + Math.random() * 0.7));

    // Opacity: slow fade in later phases
    if (newPhase === "dissolving" || newPhase === "void") {
      opacity = Math.max(0.03, opacity - decayThisTick * 0.8);
    }

    // Position update
    x += vx * dt * 30;
    y += vy * dt * 30;
    vx *= 0.98;
    vy *= 0.98;

    // Boundary: allow nodes to drift off-screen in later phases
    if (newPhase === "fragmenting" || newPhase === "dissolving") {
      x = Math.max(-20, Math.min(120, x));
      y = Math.max(-20, Math.min(120, y));
    } else {
      x = Math.max(3, Math.min(97, x));
      y = Math.max(3, Math.min(92, y));
    }

    // Connection weakening
    connections = connections
      .map(c => ({
        ...c,
        strength: Math.max(0, c.strength - decayThisTick * (0.4 + Math.random() * 0.6)),
      }))
      .filter(c => c.strength > 0.02); // prune dead connections

    // Dissolve check: if coherence drops below threshold
    const dissolved = coherence < 0.02 || opacity < 0.04;

    return { ...node, x, y, vx, vy, opacity, coherence, stability, connections, dissolved };
  });

  // 3. Event logging
  const dissolvedCount = nextNodes.filter(n => n.dissolved).length;
  if (dissolvedCount > 0 && state.tick % 60 === 0) {
    events.push(`${dissolvedCount} nodes dissolved`);
  }

  const totalConns = nextNodes.reduce((sum, n) => sum + n.connections.length, 0);
  if (totalConns === 0 && state.nodes.some(n => n.connections.length > 0)) {
    events.push("All connections lost");
  }

  return {
    ...state,
    nodes: nextNodes,
    systemCoherence: newCoherence,
    tick: state.tick + 1,
    elapsedMs: state.elapsedMs + dtMs,
    phase: newPhase,
    lastEvent: events.length > 0 ? events[events.length - 1] : state.lastEvent,
  };
}

// ─── User interaction temporarily restores coherence ────────
export function userInteractionPulse(
  state: DissolutionState,
  nodeId: string,
): DissolutionState {
  const nextNodes = state.nodes.map(node => {
    if (node.id === nodeId) {
      return {
        ...node,
        coherence: Math.min(1, node.coherence + 0.15),
        stability: Math.min(1, node.stability + 0.1),
        opacity: Math.min(1, node.opacity + 0.1),
      };
    }
    return node;
  });

  const coherenceBoost = 0.03;
  return {
    ...state,
    nodes: nextNodes,
    systemCoherence: Math.min(1, state.systemCoherence + coherenceBoost),
    lastEvent: `User touched ${nodeId.slice(0, 8)}...`,
  };
}

// ─── AI withdrawal: generate minimal observation ─────────────
export function aiObservation(state: DissolutionState): string | null {
  if (state.systemCoherence > 0.8) return null;
  if (state.systemCoherence > 0.5) return "结构正在缓慢松动。";
  if (state.systemCoherence > 0.2) return "连接正在消失。";
  if (state.systemCoherence > 0.05) return "系统几乎不可辨认。";
  return "只剩下微弱的痕迹。";
}
