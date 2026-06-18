/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars, prefer-const */
import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import type { MemoryGraph, MemoryNode, MemoryEdge } from "../../../src/lib/graph-types";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export async function GET(req: NextRequest) {
  const phone = req.nextUrl.searchParams.get("phone");
  if (!phone) return NextResponse.json({ error: "缺少phone" }, { status: 400 });

  // 加载所有记忆
  const { data: memories } = await supabaseAdmin
    .from("memories")
    .select("id, name, relationship, life_story, photo_url")
    .eq("user_phone", phone)
    .order("created_at", { ascending: false });

  if (!memories?.length) return NextResponse.json({ nodes: [], edges: [], generatedAt: Date.now() });

  // 构建节点
  const nodes: MemoryNode[] = await Promise.all(
    memories.map(async (m: any) => {
      // 获取实体状态
      const { data: entity } = await supabaseAdmin
        .from("memory_entity_state").select("emotion_state, presence_intensity, last_updated")
        .eq("memory_id", m.id).single();

      const story = (m.life_story || "").toLowerCase();
      const emotion = story.includes("离") || story.includes("病") ? "sad"
        : story.includes("笑") || story.includes("暖") ? "warm" : "nostalgic";

      return {
        id: m.id, name: m.name, relationship: m.relationship, emotion,
        presenceIntensity: entity?.presence_intensity ?? 0.6,
        photoUrl: m.photo_url,
        lastInteraction: entity?.last_updated ? new Date(entity.last_updated).getTime() : Date.now(),
      };
    })
  );

  // 构建边：基于 relationship 和 life_story 推断
  const edges: MemoryEdge[] = [];
  for (let i = 0; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) {
      const a = nodes[i], b = nodes[j];
      const relations: string[] = [];

      // 家庭关系
      const familyTerms = ["父亲", "母亲", "爸爸", "妈妈", "儿子", "女儿", "兄弟", "姐妹", "爷爷", "奶奶", "夫妻", "丈夫", "妻子"];
      if (familyTerms.some(t => a.relationship.includes(t) && b.relationship.includes(t))) {
        relations.push("family");
      }
      if (a.relationship === b.relationship) relations.push("shared_memory");
      if (a.emotion === b.emotion) relations.push("emotional");

      if (relations.length > 0) {
        // 检查DB中是否已有边
        const { data: existing } = await supabaseAdmin
          .from("memory_graph_edges")
          .select("id, strength")
          .or(`from_memory_id.eq.${a.id},to_memory_id.eq.${b.id}`)
          .or(`from_memory_id.eq.${b.id},to_memory_id.eq.${a.id}`)
          .maybeSingle();

        edges.push({
          from: a.id, to: b.id,
          relation: relations[0] as any,
          strength: existing?.strength ?? 0.5,
          description: relations.join(" · "),
        });
      }
    }
  }

  const graph: MemoryGraph = { nodes, edges, generatedAt: Date.now() };
  return NextResponse.json(graph);
}