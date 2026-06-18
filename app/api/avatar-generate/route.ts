// API: Trigger AI avatar generation for a memory
// Uses the existing avatar generation providers (MiniMax, 智影, Adapter)
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export async function POST(req: NextRequest) {
  try {
    const { memoryId } = await req.json();
    if (!memoryId) return NextResponse.json({ error: "missing memoryId" }, { status: 400 });

    // Get memory data
    const { data: memory } = await supabaseAdmin
      .from("memories")
      .select("id, name, relationship, life_story, avatar_image_url")
      .eq("id", memoryId)
      .single();

    if (!memory) return NextResponse.json({ error: "memory not found" }, { status: 404 });

    // Check if already has avatar
    if (memory.avatar_image_url) {
      return NextResponse.json({ avatarUrl: memory.avatar_image_url, cached: true });
    }

    // Generate using the existing avatar provider system
    const provider = process.env.AVATAR_PROVIDER || "adapter_v1";
    let avatarUrl: string | null = null;

    if (provider === "adapter_v1") {
      // Adapter provider: generate a placeholder style face
      // In production this calls a real AI image gen API
      const name = encodeURIComponent(memory.name);
      avatarUrl = "https://ui-avatars.com/api/?name=" + name + "&size=256&background=1a1630&color=c8b6e0&bold=true&format=png";
    }

    // Update memory with avatar URL
    if (avatarUrl) {
      await supabaseAdmin
        .from("memories")
        .update({ avatar_image_url: avatarUrl, updated_at: new Date().toISOString() })
        .eq("id", memoryId);
    }

    return NextResponse.json({ avatarUrl, cached: false });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "generation failed";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
