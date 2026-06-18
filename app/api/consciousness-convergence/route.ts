/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars, @typescript-eslint/no-non-null-asserted-optional-chain, prefer-const */
import OpenAI from "openai";
import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";

const ai = new OpenAI({ apiKey: process.env.DEEPSEEK_API_KEY, baseURL: "https://api.deepseek.com", timeout: 40000 });
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

/* ====================================================================
   Types
   ==================================================================== */
export interface ConsciousnessNode {
  id: string;
  name: string;
  relationship: string;
  type: "memory" | "merged_cluster" | "core";
  emotional_vector: { valence: number; arousal: number; dominance: number };
  coherence: number;             // 涓庡満鐨勮瀺鍚堝害 0-1
  intensity: number;             // 鎯呯华寮哄害
  position: { x: number; y: number };
  velocity: { vx: number; vy: number };
  radius: number;
  merged_from?: string[];        // 铻嶅悎鏉ユ簮
  lifecycle: "emerging" | "active" | "merging" | "fading" | "dissolved";
  glow_color: string;
}

export interface ConsciousnessField {
  nodes: ConsciousnessNode[];
  core_node: ConsciousnessNode | null;
  convergence_index: number;     // 鏁翠綋鏀舵暃搴?0-1
  coherence_index: number;
  emotional_density_map: number[][]; // 10x8 grid
  dominant_emotion: string;
  ai_insight: string;
  generated_at: number;
}

/* ====================================================================
   Helpers
   ==================================================================== */
function seededVector(seed: number): { valence: number; arousal: number; dominance: number } {
  const s1 = ((seed * 16807 + 1) % 2147483647) / 2147483647;
  const s2 = ((seed * 7919 + 1) % 2147483647) / 2147483647;
  const s3 = ((seed * 104729 + 1) % 2147483647) / 2147483647;
  return { valence: 0.25 + s1 * 0.55, arousal: 0.2 + s2 * 0.55, dominance: 0.2 + s3 * 0.55 };
}

function emotionDistance(a: { valence: number; arousal: number; dominance: number }, b: { valence: number; arousal: number; dominance: number }): number {
  return Math.sqrt((a.valence - b.valence) ** 2 + (a.arousal - b.arousal) ** 2 + (a.dominance - b.dominance) ** 2);
}

function emotionToHue(emotion: { valence: number; arousal: number }): number {
  if (emotion.valence > 0.55) return 35;       // warm gold
  if (emotion.valence > 0.35) return 200;       // peaceful blue
  if (emotion.valence > 0.15) return 260;       // melancholic violet
  return 290;                                    // fragmented purple
}

function buildField(memories: any[]): ConsciousnessField {
  const nodes: ConsciousnessNode[] = memories.map((m, i) => {
    const vec = seededVector(i);
    const angle = ((i * 0.618033988749895) % 1) * Math.PI * 2;
    const dist = 10 + (i % 6) * 7;
    const hue = emotionToHue(vec);
    return {
      id: m.id, name: m.name, relationship: m.relationship || "",
      type: "memory",
      emotional_vector: vec,
      coherence: 0.3 + vec.valence * 0.4,
      intensity: 0.3 + vec.arousal * 0.5,
      position: { x: 50 + Math.cos(angle) * dist, y: 38 + Math.sin(angle) * dist * 0.6 },
      velocity: { vx: (Math.random() - 0.5) * 0.3, vy: (Math.random() - 0.5) * 0.3 },
      radius: 3 + (vec.arousal * 5) || 4,
      lifecycle: i < 3 ? "active" : i < 6 ? "emerging" : "active",
      glow_color: `hsla(${hue},55%,65%,`,
      merged_from: undefined,
    };
  });

  // Merge close-by similar nodes
  const merged: ConsciousnessNode[] = [];
  const consumed = new Set<string>();

  for (let i = 0; i < nodes.length; i++) {
    if (consumed.has(nodes[i].id)) continue;
    const group = [nodes[i]];

    for (let j = i + 1; j < nodes.length; j++) {
      if (consumed.has(nodes[j].id)) continue;
      if (emotionDistance(nodes[i].emotional_vector, nodes[j].emotional_vector) < 0.25) {
        group.push(nodes[j]);
        consumed.add(nodes[j].id);
      }
    }

    if (group.length >= 3) {
      // Merge into a merged_cluster
      const avgVec = {
        valence: group.reduce((s, n) => s + n.emotional_vector.valence, 0) / group.length,
        arousal: group.reduce((s, n) => s + n.emotional_vector.arousal, 0) / group.length,
        dominance: group.reduce((s, n) => s + n.emotional_vector.dominance, 0) / group.length,
      };
      const hue = emotionToHue(avgVec);
      merged.push({
        id: `merged_${i}`,
        name: group.map(n => n.name).join("路"),
        relationship: "铻嶅悎鎰忚瘑",
        type: "merged_cluster",
        emotional_vector: avgVec,
        coherence: 0.7,
        intensity: group.reduce((s, n) => s + n.intensity, 0) / group.length,
        position: {
          x: group.reduce((s, n) => s + n.position.x, 0) / group.length,
          y: group.reduce((s, n) => s + n.position.y, 0) / group.length,
        },
        velocity: { vx: 0, vy: 0 },
        radius: 8 + group.length * 1.5,
        merged_from: group.map(n => n.id),
        lifecycle: "merging",
        glow_color: `hsla(${hue},55%,65%,`,
      });
    } else {
      // Keep individual nodes
      for (const n of group) merged.push(n);
    }
  }

  // Core node: highest intensity merged node
  const sorted = [...merged].sort((a, b) => b.intensity - a.intensity);
  const core: ConsciousnessNode | null = sorted.length > 0
    ? { ...sorted[0], type: "core", lifecycle: "active", radius: sorted[0].radius * 1.5 }
    : null;

  // Emotional density map (10x8)
  const densityMap: number[][] = Array.from({ length: 10 }, () => Array(8).fill(0));
  for (const n of merged) {
    const cx = Math.floor(n.position.x / 10);
    const cy = Math.floor(n.position.y / 12.5);
    if (cx >= 0 && cx < 10 && cy >= 0 && cy < 8) {
      densityMap[cx][cy] += n.intensity;
    }
  }

  const convergenceIndex = merged.filter(n => n.type === "merged_cluster").length / Math.max(merged.length, 1);

  return {
    nodes: merged,
    core_node: core,
    convergence_index: convergenceIndex,
    coherence_index: merged.reduce((s, n) => s + n.coherence, 0) / Math.max(merged.length, 1),
    emotional_density_map: densityMap,
    dominant_emotion: core?.emotional_vector.valence! > 0.4 ? "warm" : "peaceful",
    ai_insight: "",
    generated_at: Date.now(),
  };
}

/* ====================================================================
   GET: Consciousness Field
   ==================================================================== */
export async function GET(req: NextRequest) {
  const _phone = req.nextUrl.searchParams.get("phone");

  // Cache check (8 min TTL)
  const { data: cached } = await supabaseAdmin
    .from("memory_consciousness_field")
    .select("*")
    .eq("id", "global_field")
    .single();

  if (cached?.field_json?.nodes?.length && (Date.now() - new Date(cached.generated_at).getTime() < 480000)) {
    return NextResponse.json(cached.field_json as ConsciousnessField);
  }

  const { data: memories } = await supabaseAdmin
    .from("memories")
    .select("id, name, relationship, life_story")
    .limit(200);

  if (!memories?.length) {
    return NextResponse.json({
      nodes: [], core_node: null, convergence_index: 0, coherence_index: 0,
      emotional_density_map: Array.from({ length: 10 }, () => Array(8).fill(0)),
      dominant_emotion: "peaceful", ai_insight: "", generated_at: Date.now(),
    } as ConsciousnessField);
  }

  const field = buildField(memories);

  // AI insight
  if (memories.length >= 5) {
    try {
      const summary = memories.slice(0, 30).map(m => `${m.name}: ${(m.life_story || "").slice(0, 50)}`).join("\n");
      const res = await ai.chat.completions.create({
        model: "deepseek-chat", temperature: 0.5,
        messages: [
          { role: "system", content: `浣犳槸鎰忚瘑鍦哄垎鏋愬櫒銆傝瀵熻繖浜涜蹇嗙殑鎰忚瘑缁撴瀯锛岀粰鍑轰竴鍙ヨ瘽娲炲療 (15-25瀛椾腑鏂?銆?
杩斿洖绾疛SON锛?{"insight":"涓€鍙ヨ瘽娲炲療", "dominant_emotion":"warm|peaceful|melancholic|intense"}` },
          { role: "user", content: summary },
        ],
      });
      const text = (res.choices[0]?.message?.content || "").replace(/```(?:json)?\s*/g, "").replace(/```/g, "").trim();
      const match = text.match(/\{[\s\S]*\}/);
      if (match) {
        const parsed = JSON.parse(match[0]);
        field.ai_insight = parsed.insight || "";
        field.dominant_emotion = parsed.dominant_emotion || field.dominant_emotion;
      }
    } catch { /* keep default */ }
  }

  await supabaseAdmin.from("memory_consciousness_field").upsert(
    { id: "global_field", field_json: field, generated_at: new Date().toISOString() },
    { onConflict: "id" }
  );

  return NextResponse.json(field);
}

/* ====================================================================
   PATCH: Update convergence (interaction-driven)
   ==================================================================== */
export async function PATCH(req: NextRequest) {
  try {
    const { nodeId, action } = await req.json();
    if (!nodeId) return NextResponse.json({ error: "missing nodeId" }, { status: 400 });

    const { data: cached } = await supabaseAdmin
      .from("memory_consciousness_field")
      .select("field_json")
      .eq("id", "global_field")
      .single();

    if (cached?.field_json) {
      const field = cached.field_json as ConsciousnessField;
      const node = field.nodes.find(n => n.id === nodeId);
      if (node) {
        if (action === "resonate") {
          node.intensity = Math.min(1, node.intensity + 0.02);
          node.coherence = Math.min(1, node.coherence + 0.01);
        } else if (action === "observe") {
          node.intensity = Math.min(1, node.intensity + 0.01);
          node.lifecycle = node.lifecycle === "fading" ? "active" : node.lifecycle;
        }
      }
      await supabaseAdmin.from("memory_consciousness_field")
        .update({ field_json: field })
        .eq("id", "global_field");
    }
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: false });
  }
}