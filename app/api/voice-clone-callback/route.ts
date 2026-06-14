import { supabaseAdmin } from "@/src/server/supabaseAdmin";

type VoiceCloneCallback = {
  job_id?: string;
  status?: string;
  output_url?: string;
  error?: string;
};

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as VoiceCloneCallback;
    const { job_id, status, output_url, error } = body;

    if (!job_id) {
      return Response.json({ error: "?? job_id" }, { status: 400 });
    }

    // Update job status
    const jobUpdate: Record<string, unknown> = {
      status: status || "failed",
      completed_at: new Date().toISOString(),
    };

    if (output_url) {
      jobUpdate.output_url = output_url;
    }
    if (error) {
      jobUpdate.error_message = error;
    }
    if (status === "succeeded") {
      jobUpdate.progress = 100;
    }

    const { error: jobError } = await supabaseAdmin
      .from("avatar_jobs")
      .update(jobUpdate)
      .eq("id", job_id);

    if (jobError) {
      return Response.json({ error: jobError.message }, { status: 500 });
    }

    // Get the job to find memory_id
    const { data: job } = await supabaseAdmin
      .from("avatar_jobs")
      .select("memory_id")
      .eq("id", job_id)
      .single();

    if (job?.memory_id) {
      const memUpdate: Record<string, unknown> = {
        voice_clone_status: status === "succeeded" ? "succeeded" : "failed",
      };
      if (output_url) {
        memUpdate.voice_model_url = output_url;
        memUpdate.voice_model_id = job_id;
      }
      if (error) {
        memUpdate.voice_clone_error = error;
      }

      await supabaseAdmin
        .from("memories")
        .update(memUpdate)
        .eq("id", job.memory_id);
    }

    return Response.json({ success: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "??????";
    return Response.json({ error: message }, { status: 500 });
  }
}
