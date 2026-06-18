/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars, prefer-const */
import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import type { CollectiveAnalysis } from "../../../src/lib/graph-types";

const supabaseAdmin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);

export async function GET(req: NextRequest) {
  const phone = req.nextUrl.searchParams.get("phone");
  if (!phone) return NextResponse.json({ error: "缺少phone" }, { status: 400 });

  const { data: memories } = await supabaseAdmin.from("memories").select("id, name, relationship").eq("user_phone", phone);
  if (!memories?.length) return NextResponse.json({ nodes: 0 });

  // 获取所有实体状态
  const states = await Promise.all(
    memories.map(async (m: any) => {
      const { data: e } = await supabaseAdmin.from("memory_entity_state").select("emotion_state, presence_intensity, last_updated, lifecycle").eq("memory_id", m.id).single();
      return { id: m.id, name: m.name, relationship: m.relationship, emotion: e?.emotion_state, intensity: e?.presence_intensity ?? 0.5, lifecycle: e?.lifecycle ?? "reflecting", lastUpdated: e?.last_updated };
    })
  );

  // 找到最高情绪的节点
  const sorted = [...states].sort((a, b) => (b.intensity || 0) - (a.intensity || 0));
  const hotspot = sorted[0];

  // 计算网络健康度
  const awake = states.filter(s => s.lifecycle === "present" || s.lifecycle === "awakening").length;
  const networkHealth = memories.length > 0 ? awake / memories.length : 0;

  // 推荐行为
  const recommendedAction: CollectiveAnalysis["recommendedAction"] =
    networkHealth < 0.3 ? "visit"
    : networkHealth < 0.6 ? "reflect"
    : states.length >= 2 ? "fusion" : "chat";

  let hotspotReason = "";
  if (hotspot) {
    const valence = hotspot.emotion?.valence;
    if (valence && valence > 0.3) hotspotReason = `${hotspot.name}的情绪最为积极明亮`;
    else if (valence && valence < -0.1) hotspotReason = `${hotspot.name}可能需要更多关注`;
    else hotspotReason = `${hotspot.name}是记忆网络的核心`;
  }

  return NextResponse.json({
    hotspotNode: hotspot ? { id: hotspot.id, name: hotspot.name, relationship: hotspot.relationship, emotion: "warm", presenceIntensity: hotspot.intensity, photoUrl: null, lastInteraction: hotspot.lastUpdated ? new Date(hotspot.lastUpdated).getTime() : Date.now() } : null,
    hotspotReason,
    emotionalDensity: networkHealth,
    recommendedAction,
    networkHealth,
  } as CollectiveAnalysis);
}