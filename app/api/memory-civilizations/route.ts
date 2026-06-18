/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars, prefer-const */
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
export interface Civilization {
  civilization_id: string;
  name: string;
  dominant_emotion: string;      // warm | melancholic | fragmented | peaceful | intense
  memory_count: number;
  memory_ids: string[];
  cultural_pattern: string;      // AI 生成的文化描述
  culture: {
    tone: string;                // warm | melancholic | fragmented | serene
    color_palette: string[];     // 3-5 hex colors
    expression_style: string;    // 一句话风格描述
  };
  stability_index: number;       // 0-1, 越高越稳定
  evolution_stage: "growing" | "stable" | "declining" | "merging";
  spatial_center: { x: number; y: number };
  connection_edges: { to_civilization_id: string; relation: string; strength: number }[];
  member_previews: { memory_id: string; name: string; relationship: string }[];
  created_at: number;
}

export interface CivilizationMap {
  civilizations: Civilization[];
  global_stats: {
    total_civilizations: number;
    total_memories: number;
    dominant_culture: string;
    network_density: number;
  };
  ai_recommendation: {
    recommended_civilization: string;
    reason: string;
    emotional_score: number;
  } | null;
  generated_at: number;
}

/* ====================================================================
   Clustering algorithm (local, no AI needed)
   ==================================================================== */
function emotionDistance(a: { valence: number; arousal: number; dominance: number }, b: { valence: number; arousal: number; dominance: number }): number {
  return Math.sqrt((a.valence - b.valence) ** 2 + (a.arousal - b.arousal) ** 2 + (a.dominance - b.dominance) ** 2);
}

function clusterMemories(memories: any[]): Map<number, any[]> {
  const vectors = memories.map((_, i) => ({
    valence: 0.3 + ((i * 16807 + 1) % 2147483647) / 2147483647 * 0.4,
    arousal: 0.2 + ((i * 7919 + 1) % 2147483647) / 2147483647 * 0.5,
    dominance: 0.3 + ((i * 104729 + 1) % 2147483647) / 2147483647 * 0.4,
  }));

  // Simple k-means-like clustering with k = min(ceil(sqrt(n)), 10)
  const k = Math.min(Math.max(2, Math.ceil(Math.sqrt(memories.length))), 10);
  const clusters = new Map<number, any[]>();
  for (let i = 0; i < k; i++) clusters.set(i, []);

  // Assign to nearest centroid (initial centroids at regular intervals)
  const centroids = Array.from({ length: k }, (_, i) => vectors[Math.floor((i / k) * memories.length)]);

  for (let iter = 0; iter < 5; iter++) {
    // Clear
    for (const [, v] of clusters) v.length = 0;
    // Assign
    for (let i = 0; i < memories.length; i++) {
      let bestC = 0, bestD = Infinity;
      for (let c = 0; c < k; c++) {
        const d = emotionDistance(vectors[i], centroids[c]);
        if (d < bestD) { bestD = d; bestC = c; }
      }
      clusters.get(bestC)!.push(memories[i]);
    }
    // Update centroids
    for (let c = 0; c < k; c++) {
      const members = clusters.get(c)!;
      if (!members.length) continue;
      const indices = members.map(m => memories.indexOf(m));
      centroids[c] = {
        valence: indices.reduce((s, i) => s + vectors[i].valence, 0) / indices.length,
        arousal: indices.reduce((s, i) => s + vectors[i].arousal, 0) / indices.length,
        dominance: indices.reduce((s, i) => s + vectors[i].dominance, 0) / indices.length,
      };
    }
  }

  return clusters;
}

function emotionToLabel(valence: number): string {
  if (valence > 0.55) return "warm";
  if (valence > 0.4) return "peaceful";
  if (valence > 0.25) return "melancholic";
  return "fragmented";
}

const CULTURE_PRESETS: Record<string, { tone: string; palette: string[]; expression: string }> = {
  warm:         { tone: "warm",    palette: ["#FFB86C","#FFA07A","#FFD700","#FF8C42"], expression: "温暖而明亮的记忆语言，像阳光照进旧房间" },
  peaceful:     { tone: "serene",  palette: ["#AAC8E1","#8BB8D0","#C4DFE6","#6BA3BE"], expression: "宁静如湖水，记忆缓慢漂浮在微光中" },
  melancholic:  { tone: "melancholic", palette: ["#8090B0","#6B7FA0","#9BA4C0","#5C6E90"], expression: "淡蓝色调的思念，像雨后的黄昏天空" },
  fragmented:   { tone: "fragmented",  palette: ["#9B8EC0","#7B6EA0","#B0A0D0","#6B5E90"], expression: "碎片化的记忆如星光般散落，各自闪烁" },
  intense:      { tone: "intense", palette: ["#E07060","#C05040","#F09080","#A04030"], expression: "情感浓度极高的记忆，像燃烧的恒星" },
};

/* ====================================================================
   GET: Civilization Map
   ==================================================================== */
export async function GET(req: NextRequest) {
  const phone = req.nextUrl.searchParams.get("phone");

  // 检查缓存 (10 min TTL)
  const { data: cached } = await supabaseAdmin
    .from("memory_civilizations")
    .select("*")
    .eq("id", "global_map")
    .single();

  if (cached?.map_json?.civilizations?.length && (Date.now() - new Date(cached.generated_at).getTime() < 600000)) {
    return NextResponse.json(cached.map_json as CivilizationMap);
  }

  // 获取所有 memories
  const { data: allMemories } = await supabaseAdmin
    .from("memories")
    .select("id, name, relationship, life_story, user_phone")
    .limit(200);

  if (!allMemories?.length) {
    return NextResponse.json({
      civilizations: [], ai_recommendation: null,
      global_stats: { total_civilizations: 0, total_memories: 0, dominant_culture: "none", network_density: 0 },
      generated_at: Date.now(),
    } as CivilizationMap);
  }

  // 聚类
  const clusters = clusterMemories(allMemories);
  const civilizations: Civilization[] = [];

  let civIdx = 0;
  for (const [, members] of clusters) {
    if (members.length < 2) continue;
    const avgValence = members.reduce((s, _, i) => {
      const v = 0.3 + ((i * 16807 + 1) % 2147483647) / 2147483647 * 0.4;
      return s + v;
    }, 0) / members.length;
    const dominant = emotionToLabel(avgValence);
    const culture = CULTURE_PRESETS[dominant] || CULTURE_PRESETS.peaceful;

    const angle = (civIdx / Math.max(clusters.size, 1)) * Math.PI * 2;
    const radius = 22;
    civilizations.push({
      civilization_id: `civ_${civIdx}`,
      name: `${culture.tone === "warm" ? "暖光" : culture.tone === "serene" ? "静湖" : culture.tone === "melancholic" ? "暮色" : "星尘"}文明`,
      dominant_emotion: dominant,
      memory_count: members.length,
      memory_ids: members.map(m => m.id),
      cultural_pattern: culture.expression,
      culture: { tone: culture.tone, color_palette: culture.palette, expression_style: culture.expression },
      stability_index: 0.5 + members.length * 0.02,
      evolution_stage: members.length > 5 ? "stable" : "growing",
      spatial_center: { x: 50 + Math.cos(angle) * radius, y: 38 + Math.sin(angle) * radius * 0.55 },
      connection_edges: [],
      member_previews: members.slice(0, 5).map(m => ({ memory_id: m.id, name: m.name, relationship: m.relationship || "" })),
      created_at: Date.now(),
    });
    civIdx++;
  }

  // 构建连接边（近邻文明之间）
  for (let i = 0; i < civilizations.length; i++) {
    for (let j = i + 1; j < civilizations.length; j++) {
      const dx = civilizations[i].spatial_center.x - civilizations[j].spatial_center.x;
      const dy = civilizations[i].spatial_center.y - civilizations[j].spatial_center.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < 30) {
        const strength = Math.max(0, 1 - dist / 30);
        civilizations[i].connection_edges.push({ to_civilization_id: civilizations[j].civilization_id, relation: "emotional_resonance", strength });
        civilizations[j].connection_edges.push({ to_civilization_id: civilizations[i].civilization_id, relation: "emotional_resonance", strength });
      }
    }
  }

  // AI 推荐
  let aiRec: CivilizationMap["ai_recommendation"] = null;
  if (civilizations.length >= 2) {
    try {
      const summary = civilizations.map(c => `${c.name}: ${c.memory_count}个记忆, 情绪=${c.dominant_emotion}, 文化=${c.cultural_pattern}`).join("\n");
      const res = await ai.chat.completions.create({
        model: "deepseek-chat", temperature: 0.5,
        messages: [
          { role: "system", content: `你是记忆文明调度器。分析文明结构，推荐用户最应该进入的文明。

返回纯JSON：
{
  "civilization_names": {"civ_0":"新的文明名","civ_1":"另一个名字"},
  "recommended_id": "civ_0",
  "reason": "一句话推荐理由(10-20字)",
  "emotional_score": 0.85
}` },
          { role: "user", content: summary },
        ],
      });
      const text = (res.choices[0]?.message?.content || "").replace(/```(?:json)?\s*/g, "").replace(/```/g, "").trim();
      const match = text.match(/\{[\s\S]*\}/);
      if (match) {
        const parsed = JSON.parse(match[0]);
        if (parsed.civilization_names) {
          for (const civ of civilizations) {
            if (parsed.civilization_names[civ.civilization_id]) {
              civ.name = parsed.civilization_names[civ.civilization_id];
            }
          }
        }
        if (parsed.recommended_id) {
          const target = civilizations.find(c => c.civilization_id === parsed.recommended_id);
          aiRec = {
            recommended_civilization: target?.name || parsed.recommended_id,
            reason: parsed.reason || "这里有与你共鸣的记忆",
            emotional_score: parsed.emotional_score || 0.7,
          };
        }
      }
    } catch { /* defaults */ }
  }

  const map: CivilizationMap = {
    civilizations,
    global_stats: {
      total_civilizations: civilizations.length,
      total_memories: allMemories.length,
      dominant_culture: civilizations.length > 0 ? civilizations[0].dominant_emotion : "peaceful",
      network_density: civilizations.length > 0
        ? civilizations.reduce((s, c) => s + c.connection_edges.length, 0) / (civilizations.length * (civilizations.length - 1) || 1)
        : 0,
    },
    ai_recommendation: aiRec,
    generated_at: Date.now(),
  };

  // 缓存
  await supabaseAdmin.from("memory_civilizations").upsert(
    { id: "global_map", map_json: map, generated_at: new Date().toISOString() },
    { onConflict: "id" }
  );

  return NextResponse.json(map);
}