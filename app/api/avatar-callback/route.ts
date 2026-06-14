import { supabaseAdmin } from "@/src/server/supabaseAdmin";

type AvatarCallback = {
  job_id?: string;
  task_id?: string;
  status?: string;
  output_url?: string;
  error?: string;
};

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as AvatarCallback;
    const jobId = body.job_id || body.task_id;
    const { status, output_url, error } = body;

    if (!jobId) {
      return Response.json({ error: "缺少 job_id" }, { status: 400 });
    }

    // Find job by provider_job_id or direct id
    let job;
    const { data: byId } = await supabaseAdmin
      .from("avatar_jobs")
      .select("id, memory_id")
      .eq("id", jobId)
      .single();

    if (byId) {
      job = byId;
    } else {
      const { data: byProvider } = await supabaseAdmin
        .from("avatar_jobs")
        .select("id, memory_id")
        .eq("provider_job_id", jobId)
        .single();
      job = byProvider;
    }

    if (!job) {
      return Response.json({ error: "任务不存在" }, { status: 404 });
    }

    // Update job
    const jobUpdate: Record<string, unknown> = {
      status: status === "success" || status === "succeeded" ? "succeeded" : status || "failed",
      completed_at: new Date().toISOString(),
    };
    if (output_url) jobUpdate.output_url = output_url;
    if (error) jobUpdate.error_message = error;
    if (status === "succeeded" || status === "success") jobUpdate.progress = 100;

    await supabaseAdmin
      .from("avatar_jobs")
      .update(jobUpdate)
      .eq("id", job.id);

    // Update memory
    const memUpdate: Record<string, unknown> = {
      avatar_status: status === "succeeded" || status === "success" ? "succeeded" : "failed",
    };
    if (output_url) memUpdate.avatar_video_url = output_url;
    if (error) memUpdate.avatar_error = error;

    await supabaseAdmin
      .from("memories")
      .update(memUpdate)
      .eq("id", job.memory_id);

    return Response.json({ success: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "回调处理失败";
    return Response.json({ error: message }, { status: 500 });
  }
}
