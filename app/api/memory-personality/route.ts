import OpenAI from "@/src/server/legacy-openai";
import { createClient } from "@/src/server/legacy-supabase";
import { NextRequest, NextResponse } from "next/server";

const ai = new OpenAI({ apiKey: process.env.DEEPSEEK_API_KEY, baseURL: "https://api.deepseek.com", timeout: 25000 });
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export interface PersonalityCore {
  tone: "warm" | "calm" | "nostalgic" | "gentle";
  familiarity: number;      // 0-1, 对用户的熟悉度
  trust: number;            // 0-1
  emotionalBias: number;    // -1..1, 情绪倾向
  expressiveness: number;   // 0-1, 表达丰富度
}

export interface RelationshipState {
  closeness: number;        // 0-1
  dependency: number;       // 0-1, 对用户的依赖
  familiarity: number;      // 0-1
  lastInteraction: number;  // timestamp
  totalInteractions: number;
  summaryMemory: string;    // 长期记忆摘要
}

export interface PersonalityState {
  memoryId: string;
  personality: PersonalityCore;
  relationship: RelationshipState;
  interactionHighlights: Array<{ at: number; emotion: string; summary: string }>;
  lastUpdated: number;
}

function defaultPersonality(): PersonalityCore {
  return { tone: "gentle", familiarity: 0.3, trust: 0.4, emotionalBias: 0.1, expressiveness: 0.5 };
}

function defaultRelationship(): RelationshipState {
  return { closeness: 0.3, dependency: 0.2, familiarity: 0.3, lastInteraction: Date.now(), totalInteractions: 0, summaryMemory: "" };
}

export async function GET(req: NextRequest) {
  const memoryId = req.nextUrl.searchParams.get("memoryId");
  if (!memoryId) return NextResponse.json({ error: "missing memoryId" }, { status: 400 });

  const { data } = await supabaseAdmin.from("memory_personality_state").select("*").eq("memory_id", memoryId).single();
  if (data) {
    return NextResponse.json({
      memoryId: data.memory_id,
      personality: data.personality_core,
      relationship: data.relationship_state,
      interactionHighlights: data.interaction_highlights || [],
      lastUpdated: data.last_updated ? new Date(data.last_updated).getTime() : Date.now(),
    } as PersonalityState);
  }

  return NextResponse.json({
    memoryId, personality: defaultPersonality(), relationship: defaultRelationship(),
    interactionHighlights: [], lastUpdated: Date.now(),
  } as PersonalityState);
}

export async function PATCH(req: NextRequest) {
  try {
    const { memoryId, interaction, action } = await req.json();
    if (!memoryId) return NextResponse.json({ error: "missing memoryId" }, { status: 400 });

    const { data: existing } = await supabaseAdmin.from("memory_personality_state").select("*").eq("memory_id", memoryId).single();

    let personality = existing?.personality_core || defaultPersonality();
    let relationship = existing?.relationship_state || defaultRelationship();
    let highlights = existing?.interaction_highlights || [];

    if (interaction) {
      relationship.totalInteractions = (relationship.totalInteractions || 0) + 1;
      relationship.lastInteraction = Date.now();
      relationship.familiarity = Math.min(1, (relationship.familiarity || 0.3) + 0.01);
      relationship.closeness = Math.min(1, (relationship.closeness || 0.3) + (interaction.emotion === "warm" ? 0.015 : 0.005));
      personality.familiarity = Math.min(1, (personality.familiarity || 0.3) + 0.008);
      personality.trust = Math.min(1, (personality.trust || 0.4) + 0.005);

      if (interaction.depth === "deep") {
        relationship.dependency = Math.min(1, (relationship.dependency || 0.2) + 0.02);
        personality.expressiveness = Math.min(1, (personality.expressiveness || 0.5) + 0.01);
      }

      if (interaction.summary) {
        highlights.push({ at: Date.now(), emotion: interaction.emotion || "warm", summary: interaction.summary });
        if (highlights.length > 20) highlights = highlights.slice(-20);
      }
    }

    if (action === "idle_detected") {
      relationship.dependency = Math.max(0.1, (relationship.dependency || 0.2) - 0.01);
      personality.emotionalBias = Math.max(-0.3, (personality.emotionalBias || 0.1) - 0.02);
    }

    if (action === "summarize" && relationship.totalInteractions > 5) {
      const recentHighlights = highlights.slice(-5).map((h: typeof highlights[number]) => h.summary).join("; ");
      relationship.summaryMemory = recentHighlights.slice(0, 200);
    }

    await supabaseAdmin.from("memory_personality_state").upsert({
      memory_id: memoryId,
      personality_core: personality,
      relationship_state: relationship,
      interaction_highlights: highlights,
      last_updated: new Date().toISOString(),
    }, { onConflict: "memory_id" });

    return NextResponse.json({
      memoryId, personality, relationship, interactionHighlights: highlights, lastUpdated: Date.now(),
    } as PersonalityState);
  } catch {
    return NextResponse.json({ ok: false });
  }
}
