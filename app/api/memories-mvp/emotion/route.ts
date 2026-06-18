// API: Generate emotion presence text for Memory Room
import { NextRequest, NextResponse } from "next/server";
import { generateMemoryEmotionText } from "../../../lib/openai";

export async function POST(req: NextRequest) {
  try {
    const { name, relationship, lifeStory } = await req.json();
    if (!name) return NextResponse.json({ error: "missing name" }, { status: 400 });

    const text = await generateMemoryEmotionText({
      name,
      relationship: relationship || null,
      lifeStory: lifeStory || null,
    });

    return NextResponse.json({ text });
  } catch {
    return NextResponse.json({ text: "他还在。" });
  }
}
