import { supabaseAdmin } from "@/src/server/supabaseAdmin";
import { getAvatarProvider } from "@/src/server/avatar-generation";

type StartAvatarGenerationRequest = {
  memory_id?: string;
  provider?: string;
};

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as StartAvatarGenerationRequest;
    const { memory_id } = body;

    if (!memory_id) {
      return Response.json({ error: "缺少 memory_id" }, { status: 400 });
    }

    const { data: memory, error: memoryError } = await supabaseAdmin
      .from("memories")
      .select("id, user_phone, photo_url, name, voice_model_url")
      .eq("id", memory_id)
      .single();

    if (memoryError || !memory?.photo_url) {
      return Response.json({ error: "请先上传照片" }, { status: 400 });
    }

    const provider = getAvatarProvider(body.provider);

    const { data: job, error: jobError } = await supabaseAdmin
      .from("avatar_jobs")
      .insert([
        {
          user_phone: memory.user_phone,
          memory_id,
          job_type: "avatar_video",
          provider: provider.id,
          status: "pending",
          progress: 0,
          input_url: memory.photo_url,
          provider_request: {
            memory_id,
            input_url: memory.photo_url,
            provider: provider.id,
          },
        },
      ])
      .select("*")
      .single();

    if (jobError || !job) {
      return Response.json(
        { error: jobError?.message || "创建数字人任务失败" },
        { status: 500 }
      );
    }

    // Call provider to start processing
    try {
      const providerJob = await provider.createJob({
        jobId: job.id,
        memoryId: memory_id,
        photoUrl: memory.photo_url,
        name: memory.name,
        voiceModelUrl: memory.voice_model_url,
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
        .eq("id", job.id);

      await supabaseAdmin
        .from("memories")
        .update({
          avatar_status: "generating",
          avatar_job_id: job.id,
          avatar_provider: provider.id,
          avatar_error: null,
        })
        .eq("id", memory_id);

      return Response.json({
        success: true,
        job_id: job.id,
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
        .eq("id", job.id);

      await supabaseAdmin
        .from("memories")
        .update({
          avatar_status: "failed",
          avatar_error: message,
        })
        .eq("id", memory_id);

      return Response.json({ error: message }, { status: 500 });
    }
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "启动数字人生成失败";
    return Response.json({ error: message }, { status: 500 });
  }
}
