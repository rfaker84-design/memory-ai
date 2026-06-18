// MVP API: Memories CRUD
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

// GET /api/memories-mvp — list all memories for user
export async function GET(req: NextRequest) {
  const phone = req.nextUrl.searchParams.get("phone");
  if (!phone) return NextResponse.json({ error: "missing phone" }, { status: 400 });

  const { data, error } = await supabaseAdmin
    .from("memories")
    .select("id, name, relationship, life_story, created_at")
    .eq("user_phone", phone)
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data || []);
}

// POST /api/memories-mvp — create a memory
export async function POST(req: NextRequest) {
  try {
    const { name, relationship, life_story, user_phone } = await req.json();
    if (!name || !user_phone) return NextResponse.json({ error: "missing fields" }, { status: 400 });

    const { data, error } = await supabaseAdmin
      .from("memories")
      .insert({ name, relationship: relationship || null, life_story: life_story || null, user_phone })
      .select("id, name, relationship, life_story, created_at")
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json(data, { status: 201 });
  } catch {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }
}
