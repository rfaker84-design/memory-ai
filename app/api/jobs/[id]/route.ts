import { supabaseAdmin } from "@/src/server/supabaseAdmin";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  if (!id) {
    return Response.json({ error: "缺少 job id" }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin
    .from("avatar_jobs")
    .select("*")
    .eq("id", id)
    .single();

  if (error || !data) {
    return Response.json(
      { error: error?.message || "任务不存在" },
      { status: 404 }
    );
  }

  return Response.json({ job: data });
}
