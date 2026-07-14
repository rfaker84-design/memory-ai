/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars, prefer-const */
import { createClient } from "@/src/server/legacy-supabase";
import { NextRequest, NextResponse } from "next/server";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export interface EvoNode {
  id: string; name: string; relationship: string;
  x: number; y: number; vx: number; vy: number;
  mass: number; energy: number;        // 当前能量 (0-1)
  mutationStage: number;               // 0=stable, 1=evolving, 2=merging, 3=splitting, 4=fading
  clusterTag: string | null;
  connections: Array<{ to: string; strength: number; type: string }>;
}

export interface EcosystemState {
  focusId: string;
  nodes: EvoNode[];
  environmentalPressure: number;       // 0-1
  evolutionSpeed: number;              // tick multiplier
  tick: number;
  lastMutation: string | null;
  generatedAt: number;
}

function buildNodes(memories: any[], focusId: string): EvoNode[] {
  return memories.map((m, i) => {
    const angle = (i * 0.618033988749895) % 1 * Math.PI * 2;
    const dist = 15 + (i % 5) * 8;
    return {
      id: m.id, name: m.name, relationship: m.relationship || "",
      x: 50 + Math.cos(angle) * dist, y: 35 + Math.sin(angle) * dist * 0.55,
      vx: (Math.random() - 0.5) * 0.4, vy: (Math.random() - 0.5) * 0.4,
      mass: 0.4 + Math.random() * 0.4,
      energy: 0.5 + Math.random() * 0.3,
      mutationStage: 0,
      clusterTag: i < 3 ? "core" : i < 6 ? "active" : null,
      connections: [],
    };
  });
}

function buildConnections(nodes: EvoNode[], focusId: string): void {
  for (const node of nodes) {
    for (const other of nodes) {
      if (node.id === other.id) continue;
      // 关系基于名称相似度和位置距离
      const dx = node.x - other.x;
      const dy = node.y - other.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < 30) {
        const strength = Math.max(0, 1 - dist / 30) * 0.7;
        node.connections.push({ to: other.id, strength, type: dist < 15 ? "family" : "emotional" });
      }
    }
  }
}

export async function GET(req: NextRequest) {
  const memoryId = req.nextUrl.searchParams.get("memoryId");
  const phone = req.nextUrl.searchParams.get("phone");
  if (!memoryId) return NextResponse.json({ error: "missing memoryId" }, { status: 400 });

  const { data: cached } = await supabaseAdmin.from("memory_ecosystem_state").select("*").eq("focus_memory_id", memoryId).single();
  if (cached?.ecosystem_json?.nodes?.length) {
    const state = cached.ecosystem_json as EcosystemState;
    state.generatedAt = Date.now();
    return NextResponse.json(state);
  }

  const { data: allMemories } = await supabaseAdmin.from("memories").select("id, name, relationship").eq("user_phone", phone || "").limit(30);
  if (!allMemories?.length) {
    return NextResponse.json({ focusId: memoryId, nodes: [], environmentalPressure: 0, evolutionSpeed: 1, tick: 0, lastMutation: null, generatedAt: Date.now() });
  }

  const nodes = buildNodes(allMemories, memoryId);
  buildConnections(nodes, memoryId);

  const state: EcosystemState = { focusId: memoryId, nodes, environmentalPressure: 0.3, evolutionSpeed: 1, tick: 0, lastMutation: null, generatedAt: Date.now() };

  await supabaseAdmin.from("memory_ecosystem_state").upsert({ focus_memory_id: memoryId, ecosystem_json: state, last_updated: new Date().toISOString() }, { onConflict: "focus_memory_id" });
  return NextResponse.json(state);
}

export async function PATCH(req: NextRequest) {
  try {
    const { memoryId, snapshot } = await req.json();
    if (!memoryId || !snapshot) return NextResponse.json({ ok: false });
    await supabaseAdmin.from("memory_ecosystem_state").upsert({ focus_memory_id: memoryId, ecosystem_json: snapshot, last_updated: new Date().toISOString() }, { onConflict: "focus_memory_id" });
    return NextResponse.json({ ok: true });
  } catch { return NextResponse.json({ ok: false }); }
}
