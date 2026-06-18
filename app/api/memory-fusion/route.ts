import OpenAI from "openai";
import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import type { FusionResult } from "../../../src/lib/graph-types";

const ai = new OpenAI({ apiKey: process.env.DEEPSEEK_API_KEY, baseURL: "https://api.deepseek.com", timeout: 40000 });
const supabaseAdmin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);

export async function POST(req: NextRequest) {
  try {
    const { memoryIdA, memoryIdB } = await req.json();
    if (!memoryIdA || !memoryIdB) return NextResponse.json({ error: "ȱ��memoryId" }, { status: 400 });

    const [{ data: a }, { data: b }] = await Promise.all([
      supabaseAdmin.from("memories").select("name, relationship, life_story").eq("id", memoryIdA).single(),
      supabaseAdmin.from("memories").select("name, relationship, life_story").eq("id", memoryIdB).single(),
    ]);
    if (!a || !b) return NextResponse.json({ error: "���䲻����" }, { status: 404 });

    const prompt = `${a.name}(${a.relationship}): ${a.life_story || ""}\n${b.name}(${b.relationship}): ${b.life_story || ""}`;

    const res = await ai.chat.completions.create({
      model: "deepseek-chat", temperature: 0.7,
      messages: [
        { role: "system", content: `���Ǽ����ں����ʦ���������˵Ĺ����ں�Ϊһ��������䳡����

���ش�JSON��
{
  "unifiedNarrative": "30-60���ں�����",
  "sharedScene": {
    "title": "4-8�ֳ�������",
    "description": "15-25�ֳ�������",
    "emotion": "warm|sad|peaceful|nostalgic"
  },
  "relationshipInsight": "15-30�ֹ�ϵ����"
}` },
        { role: "user", content: prompt || "��λ���ߵĹ��¡�" },
      ],
    });

    const text = (res.choices[0]?.message?.content || "").replace(/```(?:json)?\s*/g, "").replace(/```/g, "").trim();
    let fusion: FusionResult | null;
    try {
      const match = text.match(/\{[\s\S]*\}/);
      fusion = match ? JSON.parse(match[0]) : null;
    } catch { fusion = null; }
    if (!fusion) {
      fusion = {
        unifiedNarrative: `${a.name}��${b.name}�Ĺ��½�֯��һ���γ��˶��صļ�ͥ���䡣`,
        sharedScene: { title: "��ͬ�ļ���", description: `${a.name}��${b.name}��ʱ��`, emotion: "warm" },
        relationshipInsight: "���ǵ������˴�������",
      };
    }

    // ���±�ǿ��
    await supabaseAdmin.from("memory_graph_edges").upsert({
      from_memory_id: memoryIdA, to_memory_id: memoryIdB,
      relation_type: "emotional", strength: 0.8,
    }, { onConflict: "from_memory_id,to_memory_id" });

    return NextResponse.json(fusion);
  } catch (err) {
    console.error("Fusion error:", err);
    return NextResponse.json({ error: "�ں�ʧ��" }, { status: 500 });
  }
}