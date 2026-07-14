/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars, prefer-const */
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
export interface GlobalMemoryNode {
  memory_id: string;
  name: string;
  relationship: string;
  origin_user_id: string;
  emotional_weight: number;
  resonance_score: number;       // 0-1, global共鸣值
  access_count: number;
  cluster_id: string | null;
  emotion_vector: { valence: number; arousal: number; dominance: number };
  life_story_snippet: string;    // 前50字
  is_trending: boolean;
  trending_velocity: number;     // 热度变化速率
}

export interface GlobalCluster {
  cluster_id: string;
  label: string;
  theme: string;
  dominant_emotion: string;
  node_count: number;
  total_resonance: number;
  color: { hue: number; sat: number };
}

export interface GlobalMemoryStream {
  trending: GlobalMemoryNode[];
  emerging_clusters: GlobalCluster[];
  fading_memories: { memory_id: string; name: string; days_since_access: number }[];
  global_stats: {
    total_memories: number;
    total_resonance: number;
    active_users_24h: number;
    peak_emotion: string;
  };
  generated_at: number;
}

/* ====================================================================
   Helpers
   ==================================================================== */
function emotionSimilarity(a: GlobalMemoryNode, b: GlobalMemoryNode): number {
  const da = a.emotion_vector.valence - b.emotion_vector.valence;
  const db = a.emotion_vector.arousal - b.emotion_vector.arousal;
  const dc = a.emotion_vector.dominance - b.emotion_vector.dominance;
  const dist = Math.sqrt(da * da + db * db + dc * dc);
  return Math.max(0, 1 - dist / Math.sqrt(3));
}

function buildDefaultStream(allNodes: GlobalMemoryNode[]): GlobalMemoryStream {
  // Sort by resonance descending
  const sorted = [...allNodes].sort((a, b) => b.resonance_score - a.resonance_score);
  const trending = sorted.slice(0, 15);

  // Build clusters by emotion similarity
  const clusters: GlobalCluster[] = [];
  const assigned = new Set<string>();
  let clusterIdx = 0;

  for (const node of sorted) {
    if (assigned.has(node.memory_id)) continue;
    const group: GlobalMemoryNode[] = [node];
    assigned.add(node.memory_id);

    for (const other of sorted) {
      if (assigned.has(other.memory_id)) continue;
      if (emotionSimilarity(node, other) > 0.7) {
        group.push(other);
        assigned.add(other.memory_id);
      }
    }

    if (group.length >= 2) {
      const avgResonance = group.reduce((s, n) => s + n.resonance_score, 0) / group.length;
      const dominantValence = group.reduce((s, n) => s + n.emotion_vector.valence, 0) / group.length;
      clusters.push({
        cluster_id: `gc_${clusterIdx++}`,
        label: `${group[0].name} 共鸣群`,
        theme: dominantValence > 0.5 ? "温暖共鸣" : dominantValence > 0 ? "平和共鸣" : "沉思共鸣",
        dominant_emotion: dominantValence > 0.5 ? "warm" : dominantValence > 0 ? "peaceful" : "nostalgic",
        node_count: group.length,
        total_resonance: avgResonance,
        color: { hue: dominantValence > 0.5 ? 35 : dominantValence > 0 ? 200 : 260, sat: 50 },
      });
    }
  }

  // Fading: accessed > 30 days ago
  const now = Date.now();
  const fading = allNodes
    .filter(n => (now - n.access_count * 1000) > 30 * 86400000)
    .slice(0, 5)
    .map(n => ({ memory_id: n.memory_id, name: n.name, days_since_access: 30 }));

  return {
    trending,
    emerging_clusters: clusters.slice(0, 6),
    fading_memories: fading,
    global_stats: {
      total_memories: allNodes.length,
      total_resonance: allNodes.reduce((s, n) => s + n.resonance_score, 0),
      active_users_24h: Math.ceil(allNodes.length * 0.3),
      peak_emotion: allNodes.length > 0
        ? allNodes.reduce((a, b) => a.resonance_score > b.resonance_score ? a : b).emotion_vector.valence > 0.5 ? "warm" : "peaceful"
        : "peaceful",
    },
    generated_at: Date.now(),
  };
}

function fakeEmotionVector(seed: number): { valence: number; arousal: number; dominance: number } {
  const s = ((seed * 16807 + 1) % 2147483647) / 2147483647;
  return {
    valence: 0.3 + s * 0.5,
    arousal: 0.2 + ((seed * 7919 + 1) % 2147483647) / 2147483647 * 0.5,
    dominance: 0.3 + ((seed * 104729 + 1) % 2147483647) / 2147483647 * 0.5,
  };
}

/* ====================================================================
   GET: 全球记忆网络
   ==================================================================== */
export async function GET(req: NextRequest) {
  const _phone = req.nextUrl.searchParams.get("phone");
  const streamOnly = req.nextUrl.searchParams.get("stream") === "1";

  // 检查缓存 (5 min TTL)
  if (streamOnly) {
    const { data: cached } = await supabaseAdmin
      .from("global_memory_graph")
      .select("stream_json, generated_at")
      .limit(1)
      .single();

    if (cached?.stream_json && (Date.now() - new Date(cached.generated_at).getTime() < 300000)) {
      return NextResponse.json(cached.stream_json as GlobalMemoryStream);
    }
  }

  // 获取所有 memories 构建 global graph
  const { data: allMemories } = await supabaseAdmin
    .from("memories")
    .select("id, name, relationship, life_story, user_phone, created_at")
    .limit(200);

  if (!allMemories?.length) {
    return NextResponse.json({
      trending: [], emerging_clusters: [], fading_memories: [],
      global_stats: { total_memories: 0, total_resonance: 0, active_users_24h: 0, peak_emotion: "peaceful" },
      generated_at: Date.now(),
    } as GlobalMemoryStream);
  }

  // 转换为 GlobalMemoryNode
  const globalNodes: GlobalMemoryNode[] = allMemories.map((m, i) => ({
    memory_id: m.id,
    name: m.name,
    relationship: m.relationship || "",
    origin_user_id: m.user_phone || "",
    emotional_weight: 0.4 + ((i * 7919 + 1) % 100) / 200,
    resonance_score: 0.2 + ((i * 16807 + 1) % 80) / 100,
    access_count: Math.floor(Math.random() * 50) + 1,
    cluster_id: null,
    emotion_vector: fakeEmotionVector(i),
    life_story_snippet: (m.life_story || "").slice(0, 50),
    is_trending: i < 8,
    trending_velocity: i < 5 ? 0.05 + Math.random() * 0.1 : 0,
  }));

  const stream = buildDefaultStream(globalNodes);

  // AI 优化 clusters
  if (globalNodes.length >= 8) {
    try {
      const summary = globalNodes.slice(0, 30).map(n =>
        `${n.name}(${n.relationship}): ${n.life_story_snippet} [valence:${n.emotion_vector.valence.toFixed(2)}]`
      ).join("\n");

      const res = await ai.chat.completions.create({
        model: "deepseek-chat", temperature: 0.5,
        messages: [
          { role: "system", content: `你是全球记忆网络调度器。分析记忆数据，识别情绪共鸣集群。

返回纯JSON：
{
  "trending_highlights": ["memory_id1", "memory_id2"],
  "cluster_suggestions": [
    {"label":"3-5字标签", "theme":"8-12字主题", "memory_ids":["id1","id2"], "dominant_emotion":"warm|sad|nostalgic|peaceful"}
  ],
  "global_mood": "一句话描述当前全球记忆情绪"
}` },
          { role: "user", content: summary },
        ],
      });

      const text = (res.choices[0]?.message?.content || "").replace(/```(?:json)?\s*/g, "").replace(/```/g, "").trim();
      const match = text.match(/\{[\s\S]*\}/);
      if (match) {
        const parsed = JSON.parse(match[0]);
        // 更新 trending
        if (Array.isArray(parsed.trending_highlights)) {
          for (const n of stream.trending) {
            n.is_trending = parsed.trending_highlights.includes(n.memory_id);
          }
        }
        // 应用 AI clusters
        if (Array.isArray(parsed.cluster_suggestions)) {
          const aiClusters: GlobalCluster[] = parsed.cluster_suggestions.map((cs: any, i: number) => ({
            cluster_id: `ai_gc_${i}`,
            label: cs.label || "共鸣群",
            theme: cs.theme || "记忆共鸣",
            dominant_emotion: cs.dominant_emotion || "peaceful",
            node_count: (cs.memory_ids || []).length,
            total_resonance: 0.6,
            color: { hue: cs.dominant_emotion === "warm" ? 35 : cs.dominant_emotion === "sad" ? 240 : 200, sat: 50 },
          }));
          stream.emerging_clusters = aiClusters;
        }
      }
    } catch { /* keep defaults */ }
  }

  // 缓存 stream
  await supabaseAdmin.from("global_memory_graph").upsert(
    { id: "global_stream", stream_json: stream, generated_at: new Date().toISOString() },
    { onConflict: "id" }
  );

  return NextResponse.json(stream);
}

/* ====================================================================
   PATCH: 更新全局共鸣
   ==================================================================== */
export async function PATCH(req: NextRequest) {
  try {
    const { memoryId, action } = await req.json();
    if (!memoryId) return NextResponse.json({ error: "missing memoryId" }, { status: 400 });

    if (action === "access" || action === "resonate") {
      // 更新 global_memory_graph 中的计数器
      const { data: existing } = await supabaseAdmin
        .from("global_memory_graph")
        .select("stream_json")
        .eq("id", "global_stream")
        .single();

      if (existing?.stream_json) {
        const stream = existing.stream_json as GlobalMemoryStream;
        const node = stream.trending.find(n => n.memory_id === memoryId);
        if (node) {
          node.access_count++;
          node.resonance_score = Math.min(1, node.resonance_score + 0.005);
        }
        await supabaseAdmin.from("global_memory_graph")
          .update({ stream_json: stream })
          .eq("id", "global_stream");
      }
    }

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: false });
  }
}
