import OpenAI from "@/src/server/legacy-openai";
import { createClient } from "@/src/server/legacy-supabase";
import { NextRequest, NextResponse } from "next/server";

const ai = new OpenAI({ apiKey: process.env.DEEPSEEK_API_KEY, baseURL: "https://api.deepseek.com", timeout: 40000 });
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export interface UniverseNode {
  memory_id: string;
  name: string;
  emotional_weight: number;   // 0-1, AI 评估的情绪重要性
  spatial_position: { x: number; y: number; z: number }; // z = 深度层 (0=近, 1=中, 2=远)
  last_interaction: number;    // timestamp
  interaction_count: number;   // 访问次数
}

export interface UniverseConfig {
  universe_id: string;
  emotional_archetype: "warm" | "nostalgic" | "fragmented" | "peaceful" | "heavy";
  spatial_model: "dense" | "sparse" | "floating" | "collapsing";
  gravity_logic: "love_centered" | "trauma_centered" | "balanced" | "fading";
  nodes: UniverseNode[];
  user_emotion_state: {
    attachment_level: number;
    curiosity_level: number;
    sadness_resonance: number;
  };
  generated_at: number;
}

// Fallback: no-AI 默认宇宙
function defaultUniverse(memories: Array<{ id: string; name: string }>, phone: string): UniverseConfig {
  const nodes: UniverseNode[] = memories.map((m, i) => {
    const angle = (i * 0.618033988749895) % 1 * Math.PI * 2;
    const r = 25 + (i % 3) * 12;
    const zLayer = i < Math.ceil(memories.length * 0.3) ? 0 : i < Math.ceil(memories.length * 0.7) ? 1 : 2;
    return {
      memory_id: m.id,
      name: m.name,
      emotional_weight: 0.5 + (i % 3) * 0.15,
      spatial_position: {
        x: 50 + Math.cos(angle) * r,
        y: 35 + Math.sin(angle) * r * 0.65,
        z: zLayer,
      },
      last_interaction: Date.now(),
      interaction_count: 1,
    };
  });
  return {
    universe_id: `u_${phone}_${Date.now()}`,
    emotional_archetype: "peaceful",
    spatial_model: "floating",
    gravity_logic: "balanced",
    nodes,
    user_emotion_state: { attachment_level: 0.5, curiosity_level: 0.5, sadness_resonance: 0.3 },
    generated_at: Date.now(),
  };
}

export async function GET(req: NextRequest) {
  const phone = req.nextUrl.searchParams.get("phone");
  if (!phone) return NextResponse.json({ error: "missing phone" }, { status: 400 });

  // 1. 检查 Supabase 缓存
  const { data: cached } = await supabaseAdmin
    .from("memory_universe_state")
    .select("*")
    .eq("user_phone", phone)
    .single();

  if (cached?.universe_json?.nodes?.length) {
    const cfg = cached.universe_json as UniverseConfig;
    // 更新访问时间
    await supabaseAdmin.from("memory_universe_state").update({ updated_at: new Date().toISOString() }).eq("user_phone", phone);
    return NextResponse.json(cfg);
  }

  // 2. 获取所有 memories
  const { data: memories } = await supabaseAdmin
    .from("memories")
    .select("id, name, relationship, life_story")
    .eq("user_phone", phone)
    .order("created_at", { ascending: false });

  if (!memories?.length) {
    return NextResponse.json({ nodes: [], universe_id: "", emotional_archetype: "peaceful", spatial_model: "sparse", gravity_logic: "balanced", user_emotion_state: { attachment_level: 0, curiosity_level: 0, sadness_resonance: 0 }, generated_at: Date.now() });
  }

  // 3. AI 生成宇宙
  const config: UniverseConfig = defaultUniverse(memories, phone);

  try {
    const summary = memories
      .map((m, i) => `[${i}] ${m.name}(${m.relationship}): ${(m.life_story || "").slice(0, 80)}`)
      .join("\n");

    const res = await ai.chat.completions.create({
      model: "deepseek-chat",
      temperature: 0.65,
      messages: [
        {
          role: "system",
          content: `你是记忆宇宙设计师。分析用户的所有记忆，生成一个"个人记忆宇宙"配置。

返回纯JSON，严格按此结构：
{
  "emotional_archetype": "warm|nostalgic|fragmented|peaceful|heavy",
  "spatial_model": "dense|sparse|floating|collapsing",
  "gravity_logic": "love_centered|trauma_centered|balanced|fading",
  "node_adjustments": [
    {"index": 0, "emotional_weight": 0.8, "z": 0}
  ]
}

规则：
- emotional_archetype: 根据整体情绪倾向选择
- spatial_model: dense=紧密聚集, sparse=分散漂浮, floating=轻微浮动, collapsing=向中心坍缩
- gravity_logic: love_centered=最有爱的关系在中心, trauma_centered=最沉重记忆在中心, balanced=均匀分布, fading=逐渐消散
- node_adjustments: 只列出需要调整权重的节点（不需要全列）
- z: 0=近景层（最重要）, 1=中景层, 2=远景层（淡出）
- emotional_weight: 0-1，越高越亮越近`,
        },
        { role: "user", content: summary },
      ],
    });

    const text = (res.choices[0]?.message?.content || "")
      .replace(/```(?:json)?\s*/g, "")
      .replace(/```/g, "")
      .trim();
    const match = text.match(/\{[\s\S]*\}/);
    if (match) {
      const parsed = JSON.parse(match[0]);
      const archetypes = ["warm", "nostalgic", "fragmented", "peaceful", "heavy"];
      const models = ["dense", "sparse", "floating", "collapsing"];
      const gravities = ["love_centered", "trauma_centered", "balanced", "fading"];

      config.emotional_archetype = archetypes.includes(parsed.emotional_archetype) ? parsed.emotional_archetype : "peaceful";
      config.spatial_model = models.includes(parsed.spatial_model) ? parsed.spatial_model : "floating";
      config.gravity_logic = gravities.includes(parsed.gravity_logic) ? parsed.gravity_logic : "balanced";

      // 应用 AI 的节点调整
      if (Array.isArray(parsed.node_adjustments)) {
        for (const adj of parsed.node_adjustments) {
          const idx = adj.index;
          if (idx >= 0 && idx < config.nodes.length) {
            if (typeof adj.emotional_weight === "number") {
              config.nodes[idx].emotional_weight = Math.max(0, Math.min(1, adj.emotional_weight));
            }
            if (typeof adj.z === "number") {
              config.nodes[idx].spatial_position.z = Math.max(0, Math.min(2, adj.z));
            }
          }
        }
      }

      // 根据 gravity_logic 重新排列空间
      if (config.gravity_logic === "love_centered") {
        config.nodes.sort((a, b) => b.emotional_weight - a.emotional_weight);
      } else if (config.gravity_logic === "trauma_centered") {
        config.nodes.sort((a, b) => a.emotional_weight - b.emotional_weight);
      } else if (config.gravity_logic === "fading") {
        config.nodes.sort((a, b) => b.interaction_count - a.interaction_count);
      }
    }
  } catch {
    // 使用默认配置
  }

  // 4. 缓存到 Supabase
  await supabaseAdmin.from("memory_universe_state").upsert(
    {
      user_phone: phone,
      universe_json: config,
      emotional_archetype: config.emotional_archetype,
      spatial_model: config.spatial_model,
      gravity_logic: config.gravity_logic,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_phone" }
  );

  return NextResponse.json(config);
}

// PATCH: 更新用户情绪状态 & 节点交互
export async function PATCH(req: NextRequest) {
  try {
    const { phone, hoveredId, clickedId, dwellTime } = await req.json();
    if (!phone) return NextResponse.json({ error: "missing phone" }, { status: 400 });

    const { data: row } = await supabaseAdmin.from("memory_universe_state").select("universe_json").eq("user_phone", phone).single();
    if (!row?.universe_json) return NextResponse.json({ ok: true });

    const cfg = row.universe_json as UniverseConfig;

    // 更新用户情绪状态
    if (dwellTime) {
      cfg.user_emotion_state.attachment_level = Math.min(1, cfg.user_emotion_state.attachment_level + dwellTime * 0.001);
      cfg.user_emotion_state.curiosity_level = Math.min(1, cfg.user_emotion_state.curiosity_level + (hoveredId ? 0.02 : -0.005));
    }

    // 更新节点交互
    if (clickedId) {
      const node = cfg.nodes.find(n => n.memory_id === clickedId);
      if (node) {
        node.interaction_count++;
        node.last_interaction = Date.now();
        node.emotional_weight = Math.min(1, node.emotional_weight + 0.03);
      }
    }

    await supabaseAdmin.from("memory_universe_state").update({ universe_json: cfg, updated_at: new Date().toISOString() }).eq("user_phone", phone);
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: false });
  }
}
