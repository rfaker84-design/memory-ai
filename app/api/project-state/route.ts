import { createClient } from "@/src/server/legacy-supabase";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

// 获取项目状态
export async function GET() {
  const { data, error } = await supabase
    .from("project_state")
    .select("*")
    .eq("id", "memory-ai")
    .single();

  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }

  return Response.json(data);
}

// 更新项目状态
export async function POST(req: Request) {
  const body = await req.json();

  const { error } = await supabase
    .from("project_state")
    .update({
      ...body,
      updated_at: new Date().toISOString(),
    })
    .eq("id", "memory-ai");

  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }

  return Response.json({ ok: true });
}
