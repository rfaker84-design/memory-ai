import OpenAI from "openai";
import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";

const ai = new OpenAI({ apiKey: process.env.DEEPSEEK_API_KEY, baseURL: "https://api.deepseek.com", timeout: 40000 });
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export interface MemoryRelation {
  fromId: string; toId: string;
  relationType: "family" | "emotional" | "contrast" | "support";
  strength: number;
  label: string;
}

export interface MemoryCluster {
  clusterId: string;
  name: string;
  memberIds: string[];
  dominantEmotion: string;
}

export interface MemoryNetwork {
  focusId: string;
  relatedMemories: Array<{ id: string; name: string; relationship: string; emotionalWeight: number }>;
  relations: MemoryRelation[];
  clusters: MemoryCluster[];
  generatedAt: number;
}

function computeRelations(memories: any[], focusId: string): MemoryRelation[] {
  const relations: MemoryRelation[] = [];
  const focus = memories.find(m => m.id === focusId);
  if (!focus) return relations;

  for (const m of memories) {
    if (m.id === focusId) continue;

    // 根据 relationship 推断关系类型
    const relTypes: string[] = [];
    if (focus.relationship && m.relationship) {
      const a = focus.relationship.toLowerCase();
      const b = m.relationship.toLowerCase();
      if (a.includes("父亲") || a.includes("母亲") || b.includes("父亲") || b.includes("母亲")) relTypes.push("family");
      if (a.includes("朋友") || b.includes("朋友")) relTypes.push("emotional");
      if (a.includes("同事") || b.includes("同事")) relTypes.push("support");
    }
    if (relTypes.length === 0) relTypes.push("emotional");

    // 情绪相似度
    const seedA = focus.life_story?.length || 10;
    const seedB = m.life_story?.length || 10;
    const similarity = 0.3 + Math.abs(Math.sin(seedA * seedB * 0.001)) * 0.5;

    for (const rt of [...new Set(relTypes)]) {
      relations.push({
        fromId: focusId, toId: m.id,
        relationType: rt as MemoryRelation["relationType"],
        strength: similarity,
        label: rt === "family" ? "家人" : rt === "emotional" ? "情感关联" : rt === "contrast" ? "对照" : "支持",
      });
    }
  }
  return relations;
}

function computeClusters(memories: any[]): MemoryCluster[] {
  const clusters: MemoryCluster[] = [];
  const familyMems = memories.filter(m => m.relationship?.includes("父亲") || m.relationship?.includes("母亲") || m.relationship?.includes("兄弟") || m.relationship?.includes("姐妹") || m.relationship?.includes("爷爷") || m.relationship?.includes("奶奶"));
  if (familyMems.length >= 2) {
    clusters.push({ clusterId: "family", name: "家人", memberIds: familyMems.map(m => m.id), dominantEmotion: "warm" });
  }
  const friendMems = memories.filter(m => m.relationship?.includes("朋友") || m.relationship?.includes("同学"));
  if (friendMems.length >= 2) {
    clusters.push({ clusterId: "friends", name: "亲友", memberIds: friendMems.map(m => m.id), dominantEmotion: "nostalgic" });
  }
  return clusters;
}

export async function GET(req: NextRequest) {
  const memoryId = req.nextUrl.searchParams.get("memoryId");
  const phone = req.nextUrl.searchParams.get("phone");
  if (!memoryId) return NextResponse.json({ error: "missing memoryId" }, { status: 400 });

  // 缓存 (8 min)
  const { data: cached } = await supabaseAdmin.from("memory_relationship_graph").select("*").eq("focus_memory_id", memoryId).single();
  if (cached?.network_json?.relations?.length && (Date.now() - new Date(cached.generated_at).getTime() < 480000)) {
    return NextResponse.json(cached.network_json as MemoryNetwork);
  }

  const { data: allMemories } = await supabaseAdmin
    .from("memories").select("id, name, relationship, life_story")
    .eq("user_phone", phone || "").limit(30);

  if (!allMemories?.length) {
    return NextResponse.json({ focusId: memoryId, relatedMemories: [], relations: [], clusters: [], generatedAt: Date.now() });
  }

  const relations = computeRelations(allMemories, memoryId);
  const clusters = computeClusters(allMemories);
  const relatedMemories = allMemories
    .filter(m => m.id !== memoryId)
    .map(m => ({ id: m.id, name: m.name, relationship: m.relationship || "", emotionalWeight: 0.5 + Math.random() * 0.3 }));

  const network: MemoryNetwork = {
    focusId: memoryId,
    relatedMemories: relatedMemories.slice(0, 12),
    relations, clusters,
    generatedAt: Date.now(),
  };

  // AI 优化关系网络
  if (allMemories.length >= 4) {
    try {
      const summary = allMemories.map(m => `${m.name}(${m.relationship}): ${(m.life_story || "").slice(0, 40)}`).join("\n");
      const res = await ai.chat.completions.create({
        model: "deepseek-chat", temperature: 0.5,
        messages: [
          { role: "system", content: `你是记忆关系网络分析师。分析记忆之间的关系，返回优化后的关系图。

返回纯JSON：
{
  "relations_to_add": [{"from":"memory_name", "to":"memory_name", "type":"family|emotional|contrast|support", "label":"关系描述"}],
  "cluster_suggestions": [{"name":"群组名", "members":["name1","name2"], "emotion":"warm|nostalgic|peaceful"}],
  "cross_reference_hints": ["memory A 会这样提到 memory B：一句话"]
}` },
          { role: "user", content: `当前焦点：${allMemories.find(m => m.id === memoryId)?.name || "某人"}\n${summary}` },
        ],
      });
      const text = (res.choices[0]?.message?.content || "").replace(/```(?:json)?\s*/g, "").replace(/```/g, "").trim();
      const match = text.match(/\{[\s\S]*\}/);
      if (match) {
        const parsed = JSON.parse(match[0]);
        if (Array.isArray(parsed.cluster_suggestions)) {
          for (const cs of parsed.cluster_suggestions) {
            const memberIds = cs.members.map((n: string) => allMemories.find((m: any) => m.name === n)?.id).filter(Boolean);
            if (memberIds.length >= 2) {
              network.clusters.push({ clusterId: `ai_${Date.now()}`, name: cs.name, memberIds, dominantEmotion: cs.emotion || "peaceful" });
            }
          }
        }
      }
    } catch { /* keep computed */ }
  }

  await supabaseAdmin.from("memory_relationship_graph").upsert(
    { focus_memory_id: memoryId, network_json: network, generated_at: new Date().toISOString() },
    { onConflict: "focus_memory_id" }
  );

  return NextResponse.json(network);
}