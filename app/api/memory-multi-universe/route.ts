import OpenAI from "@/src/server/legacy-openai";
import { createClient } from "@/src/server/legacy-supabase";
import { NextRequest, NextResponse } from "next/server";

const ai = new OpenAI({ apiKey: process.env.DEEPSEEK_API_KEY, baseURL: "https://api.deepseek.com", timeout: 40000 });
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

/* ====================================================================
   Types
   ==================================================================== */
export interface UniverseClusterNode {
  memory_id: string;
  name: string;
  relationship: string;
  emotional_weight: number;
  creator_weight: number;       // 创建者权重 (0-1)
  viewer_influence: number;     // 访问者影响
  emotional_resonance: number;  // 共鸣值
  spatial_position: { x: number; y: number; z: number };
  interaction_count: number;
  last_interaction: number;
  shared_by?: string[];         // 哪些用户共享了这个 memory
  comments?: { user: string; text: string; emotion: string; at: number }[];
  reactions?: { user: string; emotion: string; at: number }[];
}

export interface EmotionLayer {
  userId: string;
  attachment: number;
  curiosity: number;
  sadness: number;
  dominant: string; // "warm" | "sad" | "nostalgic" | "peaceful"
  intensity: number;
}

export interface MultiUniverseState {
  user_phone: string;
  universes: UniverseEntry[];
  family_graph: {
    edges: { from: string; to: string; relation: string; strength: number }[];
    groups: { id: string; name: string; memberIds: string[] }[];
  };
  emotion_field: {
    layers: EmotionLayer[];
    blended: EmotionLayer;
  };
  generated_at: number;
}

export interface UniverseEntry {
  universe_id: string;
  type: "personal" | "family" | "shared";
  label: string;
  emotional_archetype: string;
  spatial_model: string;
  gravity_logic: string;
  nodes: UniverseClusterNode[];
  memberCount: number;
  color: { hue: number; sat: number };
}

/* ====================================================================
   Helpers
   ==================================================================== */
function defaultUniverseState(phone: string, memories: any[]): MultiUniverseState {
  // 将 memories 按 family group 分组
  const familyGroups = groupByFamily(memories);
  const universes: UniverseEntry[] = [];

  // Personal universe: 用户自己创建的 memories
  const personalMems = memories.filter(m => m.user_phone === phone || !m.family_id);
  universes.push(buildUniverseEntry("personal", `${phone}_personal`, "个人宇宙", personalMems, { hue: 210, sat: 50 }));

  // Family universes
  for (const [familyId, famMems] of Object.entries(familyGroups)) {
    universes.push(buildUniverseEntry("family", `${phone}_family_${familyId}`, `家族记忆`, famMems, { hue: 30, sat: 55 }));
  }

  // Shared universe
  const sharedMems = memories.filter(m => m.is_shared);
  if (sharedMems.length) {
    universes.push(buildUniverseEntry("shared", `${phone}_shared`, "共享空间", sharedMems, { hue: 160, sat: 45 }));
  }

  return {
    user_phone: phone,
    universes,
    family_graph: buildFamilyGraph(memories, familyGroups),
    emotion_field: {
      layers: [],
      blended: { userId: phone, attachment: 0.5, curiosity: 0.5, sadness: 0.3, dominant: "peaceful", intensity: 0.5 },
    },
    generated_at: Date.now(),
  };
}

function groupByFamily(memories: any[]): Record<string, any[]> {
  const groups: Record<string, any[]> = {};
  for (const m of memories) {
    const key = m.family_id || m.family_group || "";
    if (!key) continue;
    if (!groups[key]) groups[key] = [];
    groups[key].push(m);
  }
  return groups;
}

function buildUniverseEntry(
  type: "personal" | "family" | "shared",
  id: string, label: string, memories: any[],
  color: { hue: number; sat: number }
): UniverseEntry {
  const nodes: UniverseClusterNode[] = memories.map((m, i) => {
    const angle = (i * 0.618033988749895) % 1 * Math.PI * 2;
    const r = 18 + (i % 3) * 10;
    return {
      memory_id: m.id,
      name: m.name,
      relationship: m.relationship || "",
      emotional_weight: 0.5 + (i % 3) * 0.15,
      creator_weight: m.user_phone === m.creator_phone ? 1 : 0.3,
      viewer_influence: 0,
      emotional_resonance: 0.3,
      spatial_position: { x: 50 + Math.cos(angle) * r, y: 35 + Math.sin(angle) * r * 0.65, z: i % 3 },
      interaction_count: 1,
      last_interaction: Date.now(),
      shared_by: m.shared_by || [],
    };
  });
  return {
    universe_id: id, type, label,
    emotional_archetype: type === "family" ? "warm" : type === "shared" ? "peaceful" : "nostalgic",
    spatial_model: memories.length > 8 ? "dense" : "floating",
    gravity_logic: type === "family" ? "love_centered" : "balanced",
    nodes, memberCount: memories.length, color,
  };
}

function buildFamilyGraph(memories: any[], groups: Record<string, any[]>): MultiUniverseState["family_graph"] {
  const edges: MultiUniverseState["family_graph"]["edges"] = [];
  const graphGroups: MultiUniverseState["family_graph"]["groups"] = [];

  for (const [groupId, mems] of Object.entries(groups)) {
    graphGroups.push({ id: groupId, name: `家族 ${groupId.slice(0, 6)}`, memberIds: mems.map(m => m.id) });
    for (let i = 0; i < mems.length; i++) {
      for (let j = i + 1; j < mems.length; j++) {
        edges.push({ from: mems[i].id, to: mems[j].id, relation: "family", strength: 0.8 });
      }
    }
  }
  return { edges, groups: graphGroups };
}

function blendEmotions(layers: EmotionLayer[]): EmotionLayer {
  if (!layers.length) return { userId: "", attachment: 0.5, curiosity: 0.5, sadness: 0.3, dominant: "peaceful", intensity: 0 };
  const n = layers.length;
  const blended: EmotionLayer = {
    userId: "blended",
    attachment: layers.reduce((s, l) => s + l.attachment, 0) / n,
    curiosity: layers.reduce((s, l) => s + l.curiosity, 0) / n,
    sadness: layers.reduce((s, l) => s + l.sadness, 0) / n,
    dominant: layers.sort((a, b) => b.intensity - a.intensity)[0]?.dominant || "peaceful",
    intensity: Math.min(1, Math.sqrt(layers.reduce((s, l) => s + l.intensity * l.intensity, 0) / n)),
  };
  return blended;
}

/* ====================================================================
   GET: 加载多宇宙状态
   ==================================================================== */
export async function GET(req: NextRequest) {
  const phone = req.nextUrl.searchParams.get("phone");
  if (!phone) return NextResponse.json({ error: "missing phone" }, { status: 400 });

  // 检查缓存
  const { data: cached } = await supabaseAdmin
    .from("memory_multi_universe_state")
    .select("*")
    .eq("user_phone", phone)
    .single();

  if (cached?.state_json?.universes?.length) {
    await supabaseAdmin.from("memory_multi_universe_state")
      .update({ last_updated: new Date().toISOString() })
      .eq("user_phone", phone);
    return NextResponse.json(cached.state_json as MultiUniverseState);
  }

  // 获取用户 memories
  const { data: ownMemories } = await supabaseAdmin
    .from("memories")
    .select("id, name, relationship, life_story, user_phone, family_id, family_group, is_shared, shared_by, creator_phone")
    .eq("user_phone", phone)
    .order("created_at", { ascending: false })
    .limit(50);

  // 获取共享 memories
  const { data: sharedMemories } = await supabaseAdmin
    .from("memories")
    .select("id, name, relationship, life_story, user_phone, family_id, family_group, is_shared, shared_by, creator_phone")
    .contains("shared_by", [phone])
    .limit(30);

  const allMemories = [...(ownMemories || []), ...(sharedMemories || [])];
  // 去重
  const seen = new Set<string>();
  const unique = allMemories.filter(m => { if (seen.has(m.id)) return false; seen.add(m.id); return true; });

  let state: MultiUniverseState = defaultUniverseState(phone, unique);

  // AI 优化宇宙结构
  if (unique.length >= 3) {
    try {
      const summary = unique
        .map((m, i) => `[${i}] ${m.name}(${m.relationship}): ${(m.life_story || "").slice(0, 60)}${m.family_group ? ` [family:${m.family_group}]` : ""}`)
        .join("\n");

      const res = await ai.chat.completions.create({
        model: "deepseek-chat", temperature: 0.6,
        messages: [
          { role: "system", content: `你是多宇宙记忆架构师。分析用户的记忆数据，优化宇宙分组。

返回纯JSON：
{
  "universe_suggestions": [
    {"type":"personal|family|shared", "memory_indices":[0,2,5], "emotional_archetype":"warm|nostalgic|peaceful", "label":"3-5字标签"}
  ]
}
规则：
- 同一family_group的memory应在同一family universe
- shared memories放在shared universe
- personal universe放用户个人记忆
- 每个universe最多10个node
- 只返回关键分组，不需要全部列出` },
          { role: "user", content: summary },
        ],
      });

      const text = (res.choices[0]?.message?.content || "").replace(/```(?:json)?\s*/g, "").replace(/```/g, "").trim();
      const match = text.match(/\{[\s\S]*\}/);
      if (match) {
        const parsed = JSON.parse(match[0]);
        if (Array.isArray(parsed.universe_suggestions)) {
          // 应用 AI 建议调整标签和情绪
          for (const sug of parsed.universe_suggestions) {
            const uni = state.universes.find(u => u.type === sug.type);
            if (uni && sug.emotional_archetype) uni.emotional_archetype = sug.emotional_archetype;
            if (uni && sug.label) uni.label = sug.label;
          }
        }
      }
    } catch { /* keep defaults */ }
  }

  // 缓存
  await supabaseAdmin.from("memory_multi_universe_state").upsert(
    { user_phone: phone, state_json: state, last_updated: new Date().toISOString() },
    { onConflict: "user_phone" }
  );

  return NextResponse.json(state);
}

/* ====================================================================
   PATCH: 情绪叠加 & 交互更新
   ==================================================================== */
export async function PATCH(req: NextRequest) {
  try {
    const { phone, universeId, memoryId, emotion, action } = await req.json();
    if (!phone) return NextResponse.json({ error: "missing phone" }, { status: 400 });

    const { data: row } = await supabaseAdmin
      .from("memory_multi_universe_state")
      .select("state_json")
      .eq("user_phone", phone)
      .single();

    if (!row?.state_json) return NextResponse.json({ ok: true });
    const state = row.state_json as MultiUniverseState;

    if (emotion && Array.isArray(state.emotion_field.layers)) {
      // 更新当前用户情绪层
      const idx = state.emotion_field.layers.findIndex(l => l.userId === phone);
      if (idx >= 0) {
        state.emotion_field.layers[idx] = { ...state.emotion_field.layers[idx], ...emotion };
      } else {
        state.emotion_field.layers.push({ userId: phone, attachment: 0.5, curiosity: 0.5, sadness: 0.3, dominant: "peaceful", intensity: 0.5, ...emotion });
      }
      state.emotion_field.blended = blendEmotions(state.emotion_field.layers);
    }

    if (memoryId && action === "interact") {
      for (const uni of state.universes) {
        const node = uni.nodes.find(n => n.memory_id === memoryId);
        if (node) {
          node.interaction_count++;
          node.last_interaction = Date.now();
          node.viewer_influence = Math.min(1, node.viewer_influence + 0.02);
          node.emotional_resonance = Math.min(1, node.emotional_resonance + 0.01);
        }
      }
    }

    if (memoryId && action === "react" && emotion) {
      for (const uni of state.universes) {
        const node = uni.nodes.find(n => n.memory_id === memoryId);
        if (node) {
          if (!node.reactions) node.reactions = [];
          node.reactions.push({ user: phone, emotion: emotion.dominant || "warm", at: Date.now() });
        }
      }
    }

    await supabaseAdmin.from("memory_multi_universe_state")
      .update({ state_json: state, last_updated: new Date().toISOString() })
      .eq("user_phone", phone);

    return NextResponse.json({ ok: true, blended: state.emotion_field.blended });
  } catch {
    return NextResponse.json({ ok: false });
  }
}
