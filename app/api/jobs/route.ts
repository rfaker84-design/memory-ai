import { supabaseAdmin } from "@/src/server/supabaseAdmin";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const memoryId = searchParams.get("memory_id");

  if (!memoryId) {
    return Response.json({ error: "?? memory_id" }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin
    .from("avatar_jobs")
    .select(
      "id, memory_id, job_type, provider, provider_job_id, status, progress, input_url, output_url, error_message, completed_at, created_at, updated_at"
    )
    .eq("memory_id", memoryId)
    .order("created_at", { ascending: false })
    .limit(20);

  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }

  return Response.json({ jobs: data || [] });
}
