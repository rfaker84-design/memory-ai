// EvolutionEngine.ts — Core self-evolution logic for V7 Memory Ecosystem
//
// Rules:
//   state(t+1) = mutate(state(t), user_interaction, emotional_pressure)
//   - High-frequency access → evolve stronger
//   - Long-term idle → decay or mutate
//   - Emotional shock → structural reorganization

export interface EvoNode {
  id: string; name: string; relationship: string;
  x: number; y: number; vx: number; vy: number;
  mass: number; energy: number;
  mutationStage: number;  // 0=stable, 1=evolving, 2=merging, 3=splitting, 4=fading
  clusterTag: string | null;
  connections: Array<{ to: string; strength: number; type: string }>;
}

export interface EcosystemState {
  focusId: string;
  nodes: EvoNode[];
  environmentalPressure: number;
  evolutionSpeed: number;
  tick: number;
  lastMutation: string | null;
  generatedAt: number;
}

export interface EvolutionEvent {
  tick: number;
  type: "merge" | "split" | "fade" | "evolve" | "drift";
  nodeIds: string[];
  description: string;
}

// ─── Core mutation function ──────────────────────────────────
export function evolveTick(
  nodes: EvoNode[],
  pressure: number,
  speed: number,
  tick: number,
  focusId: string,
): { nodes: EvoNode[]; events: EvolutionEvent[]; newPressure: number } {
  const events: EvolutionEvent[] = [];
  const next = nodes.map((n) => ({
    ...n,
    x: n.x, y: n.y, vx: n.vx, vy: n.vy,
    connections: n.connections.map(c => ({ ...c })),
  }));

  // 1. Physical drift
  for (const node of next) {
    node.vx += (Math.random() - 0.5) * speed * 0.3;
    node.vy += (Math.random() - 0.5) * speed * 0.3;

    // Gravitational pull toward focus
    const focusNode = next.find(nn => nn.id === focusId);
    if (focusNode && node.id !== focusId) {
      const dx = focusNode.x - node.x;
      const dy = focusNode.y - node.y;
      const dist = Math.max(Math.sqrt(dx * dx + dy * dy), 1);
      node.vx += (dx / dist) * speed * 0.08;
      node.vy += (dy / dist) * speed * 0.08;
    }

    // Repulsion between nearby nodes
    for (const other of next) {
      if (other.id === node.id) continue;
      const dx = node.x - other.x;
      const dy = node.y - other.y;
      const dist = Math.max(Math.sqrt(dx * dx + dy * dy), 1);
      if (dist < 8) {
        node.vx += (dx / dist) * speed * 0.15;
        node.vy += (dy / dist) * speed * 0.15;
      }
    }

    // Damping
    node.vx *= 0.95;
    node.vy *= 0.95;
    node.x += node.vx;
    node.y += node.vy;
    node.x = Math.max(3, Math.min(97, node.x));
    node.y = Math.max(3, Math.min(92, node.y));
  }

  // 2. Energy dynamics
  for (const node of next) {
    if (node.mutationStage === 4) {
      node.energy = Math.max(0.02, node.energy - speed * 0.4);
    } else if (node.mutationStage === 1) {
      node.energy = Math.min(1, node.energy + speed * 0.25);
    } else if (node.mutationStage === 2) {
      node.energy = Math.min(1, node.energy + speed * 0.15);
    } else {
      // Homeostasis: drift toward 0.5
      node.energy += (0.5 - node.energy) * speed * 0.08;
    }

    // Pressure accelerates energy change
    node.energy += (Math.random() - 0.5) * pressure * speed * 0.1;
    node.energy = Math.max(0.02, Math.min(1, node.energy));
  }

  // 3. Mutation stage transitions
  for (const node of next) {
    const prevStage = node.mutationStage;

    if (node.energy < 0.12) {
      node.mutationStage = 4; // fade
    } else if (node.energy > 0.88 && pressure > 0.4) {
      node.mutationStage = 1; // evolve
    } else if (node.energy > 0.7 && pressure > 0.5 && Math.random() < 0.02) {
      node.mutationStage = 2; // merge candidate
    } else if (node.energy < 0.25 && pressure > 0.6 && node.mutationStage === 0) {
      node.mutationStage = 3; // split
    } else if (node.energy > 0.3 && node.energy < 0.7 && node.mutationStage !== 0) {
      node.mutationStage = 0; // stabilize
    }

    if (prevStage !== node.mutationStage) {
      events.push({
        tick,
        type: stageToEventType(node.mutationStage),
        nodeIds: [node.id],
        description: `${node.name} → ${stageLabel(node.mutationStage)}`,
      });
    }
  }

  // 4. Connection dynamics
  for (const node of next) {
    // Strengthen or weaken connections
    node.connections = node.connections.map(c => ({
      ...c,
      strength: Math.max(0.03, Math.min(1, c.strength + (Math.random() - 0.5) * speed * 0.15)),
    }));

    // Prune dead connections
    node.connections = node.connections.filter(c => c.strength > 0.05);

    // Form new connections with nearby high-energy nodes
    for (const other of next) {
      if (other.id === node.id) continue;
      if (node.connections.some(c => c.to === other.id)) continue;
      const dx = node.x - other.x;
      const dy = node.y - other.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < 20 && node.energy > 0.4 && other.energy > 0.4 && Math.random() < 0.03) {
        node.connections.push({
          to: other.id,
          strength: 0.15 + Math.random() * 0.2,
          type: dist < 10 ? "family" : "emotional",
        });
        events.push({
          tick,
          type: "evolve",
          nodeIds: [node.id, other.id],
          description: `New connection: ${node.name} ↔ ${other.name}`,
        });
      }
    }
  }

  // 5. Environmental pressure auto-regulation
  const newPressure = Math.max(0.05, Math.min(1,
    pressure + (Math.random() - 0.5) * 0.03
      - (next.filter(n => n.mutationStage === 0).length / Math.max(next.length, 1)) * 0.01 // stability reduces pressure
  ));

  return { nodes: next, events, newPressure };
}

// ─── Cluster mutation: merge nearby nodes ────────────────────
export function detectAndMergeClusters(
  nodes: EvoNode[],
  tick: number,
): { nodes: EvoNode[]; events: EvolutionEvent[] } {
  const events: EvolutionEvent[] = [];
  const next = nodes.map(n => ({ ...n, connections: n.connections.map(c => ({ ...c })) }));

  // Find pairs of nodes in stage 2 (merge candidate) that are close to each other
  const mergingCandidates = next.filter(n => n.mutationStage === 2);
  const merged = new Set<string>();

  for (let i = 0; i < mergingCandidates.length; i++) {
    for (let j = i + 1; j < mergingCandidates.length; j++) {
      const a = mergingCandidates[i];
      const b = mergingCandidates[j];
      if (merged.has(a.id) || merged.has(b.id)) continue;

      const dx = a.x - b.x;
      const dy = a.y - b.y;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist < 12) {
        // Merge: a absorbs b
        a.x = (a.x + b.x) / 2;
        a.y = (a.y + b.y) / 2;
        a.mass = Math.min(1, a.mass + b.mass * 0.5);
        a.energy = Math.min(1, Math.max(a.energy, b.energy) + 0.15);
        a.mutationStage = 1; // evolved
        a.clusterTag = a.clusterTag || b.clusterTag || `merged_${tick}`;

        // Transfer connections from b to a
        for (const conn of b.connections) {
          if (conn.to === a.id) continue;
          if (!a.connections.some(c => c.to === conn.to)) {
            a.connections.push({ ...conn, strength: conn.strength * 0.8 });
          }
        }

        // Re-point other nodes' connections from b to a
        for (const node of next) {
          if (node.id === a.id || node.id === b.id) continue;
          const existing = node.connections.find(c => c.to === b.id);
          if (existing) {
            existing.to = a.id;
            existing.strength *= 0.85;
          }
        }

        merged.add(b.id);
        events.push({
          tick,
          type: "merge",
          nodeIds: [a.id, b.id],
          description: `Cluster merge: ${a.name} ← ${b.name}`,
        });
      }
    }
  }

  // Remove absorbed nodes
  const filtered = next.filter(n => !merged.has(n.id));

  return { nodes: filtered, events };
}

// ─── Cluster split: fragment high-mass nodes ─────────────────
export function detectAndSplitClusters(
  nodes: EvoNode[],
  tick: number,
): { nodes: EvoNode[]; events: EvolutionEvent[] } {
  const events: EvolutionEvent[] = [];
  const next = [...nodes.map(n => ({ ...n, connections: n.connections.map(c => ({ ...c })) }))];
  const newNodes: EvoNode[] = [];

  for (const node of next) {
    if (node.mutationStage === 3 && node.mass > 0.6 && Math.random() < 0.15) {
      // Split into two nodes
      const childId = `${node.id}_split_${tick}`;
      const child: EvoNode = {
        id: childId,
        name: `${node.name}·碎片`,
        relationship: node.relationship,
        x: node.x + (Math.random() - 0.5) * 12,
        y: node.y + (Math.random() - 0.5) * 12,
        vx: (Math.random() - 0.5) * 0.8,
        vy: (Math.random() - 0.5) * 0.8,
        mass: node.mass * 0.35,
        energy: node.energy * 0.5,
        mutationStage: 1, // evolving
        clusterTag: node.clusterTag,
        connections: node.connections
          .filter(() => Math.random() > 0.5)
          .map(c => ({ ...c, strength: c.strength * 0.6 })),
      };

      node.mass *= 0.65;
      node.energy *= 0.7;
      node.mutationStage = 0; // stabilize parent
      node.connections.push({ to: childId, strength: 0.7, type: "family" });

      newNodes.push(child);
      events.push({
        tick,
        type: "split",
        nodeIds: [node.id, childId],
        description: `Split: ${node.name} → fragment`,
      });
    }
  }

  return { nodes: [...next, ...newNodes], events };
}

// ─── Autonomous behavior: nodes can change relationships ─────
export function autonomousBehavior(
  nodes: EvoNode[],
  tick: number,
): { nodes: EvoNode[]; events: EvolutionEvent[] } {
  const events: EvolutionEvent[] = [];
  const next = nodes.map(n => ({ ...n, connections: n.connections.map(c => ({ ...c })) }));

  for (const node of next) {
    if (Math.random() > 0.05) continue; // Only 5% chance per tick

    const action = Math.random();
    if (action < 0.3 && node.connections.length > 0) {
      // Strengthen a random connection
      const idx = Math.floor(Math.random() * node.connections.length);
      node.connections[idx].strength = Math.min(1, node.connections[idx].strength + 0.1);
    } else if (action < 0.5 && node.connections.length > 2) {
      // Weaken a random connection
      const idx = Math.floor(Math.random() * node.connections.length);
      node.connections[idx].strength = Math.max(0.03, node.connections[idx].strength - 0.08);
    } else if (action < 0.65 && node.clusterTag) {
      // Leave cluster
      node.clusterTag = null;
      node.mutationStage = 3;
      events.push({
        tick, type: "drift",
        nodeIds: [node.id],
        description: `${node.name} leaves cluster`,
      });
    }
  }

  return { nodes: next, events };
}

// ─── Emotional wave propagation ──────────────────────────────
export function propagateEmotion(
  nodes: EvoNode[],
  sourceId: string,
  intensity: number,
): EvoNode[] {
  return nodes.map(node => {
    if (node.id === sourceId) return node;
    const connection = node.connections.find(c => c.to === sourceId);
    if (!connection) return node;
    const influence = intensity * connection.strength * 0.3;
    return {
      ...node,
      energy: Math.max(0.02, Math.min(1, node.energy + influence)),
    };
  });
}

// ─── Helpers ─────────────────────────────────────────────────
function stageToEventType(stage: number): EvolutionEvent["type"] {
  switch (stage) {
    case 1: return "evolve";
    case 2: return "merge";
    case 3: return "split";
    case 4: return "fade";
    default: return "drift";
  }
}

function stageLabel(stage: number): string {
  switch (stage) {
    case 0: return "stable";
    case 1: return "evolving";
    case 2: return "merging";
    case 3: return "splitting";
    case 4: return "fading";
    default: return "unknown";
  }
}
