import { supabaseAdmin } from "@/src/server/supabaseAdmin";
import { getAvatarProvider } from "@/src/server/avatar-generation";

type AvatarProviderRequest = {
  job_id?: string;
};

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as AvatarProviderRequest;
    const { job_id } = body;

    if (!job_id) {
      return Response.json({ error: "缺少 job_id" }, { status: 400 });
    }

    const { data: job, error: jobError } = await supabaseAdmin
      .from("avatar_jobs")
      .select("*")
      .eq("id", job_id)
      .single();

    if (jobError || !job) {
      return Response.json({ error: "任务不存在" }, { status: 404 });
    }

    // Get associated memory for photo/voice info
    const { data: memory } = await supabaseAdmin
      .from("memories")
      .select("id, photo_url, name, voice_model_url")
      .eq("id", job.memory_id)
      .single();

    const provider = getAvatarProvider();

    try {
      const providerJob = await provider.createJob({
        jobId: job.id,
        memoryId: job.memory_id,
        photoUrl: memory?.photo_url || job.input_url || "",
        name: memory?.name || "",
        voiceModelUrl: memory?.voice_model_url || "",
      });

      await supabaseAdmin
        .from("avatar_jobs")
        .update({
          provider: providerJob.provider,
          provider_job_id: providerJob.providerJobId,
          status: providerJob.status,
          progress: providerJob.progress,
          provider_request: providerJob.providerRequest,
          provider_response: providerJob.providerResponse,
        })
        .eq("id", job_id);

      return Response.json({
        success: true,
        job_id,
        provider: providerJob.provider,
        status: providerJob.status,
        progress: providerJob.progress,
      });
    } catch (providerError: unknown) {
      const message =
        providerError instanceof Error ? providerError.message : "数字人厂商调用失败";

      await supabaseAdmin
        .from("avatar_jobs")
        .update({
          status: "failed",
          error_message: message,
        })
        .eq("id", job_id);

      return Response.json({ error: message }, { status: 500 });
    }
  } catch (error) {
    console.error(error);
    return Response.json({ error: "数字人适配层启动失败" }, { status: 500 });
  }
}
