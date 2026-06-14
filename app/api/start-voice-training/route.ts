import { supabaseAdmin } from "@/src/server/supabaseAdmin";
import { getVoiceCloneProvider } from "@/src/server/voice-clone";

type StartVoiceTrainingRequest = {
  memory_id?: string;
  provider?: string;
};

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as StartVoiceTrainingRequest;
    const { memory_id } = body;

    if (!memory_id) {
      return Response.json({ error: "?? memory_id" }, { status: 400 });
    }

    const { data: memory, error: memoryError } = await supabaseAdmin
      .from("memories")
      .select(
        "id, user_phone, name, relationship, voice_sample_url, speech_style"
      )
      .eq("id", memory_id)
      .single();

    if (memoryError || !memory?.voice_sample_url) {
      return Response.json({ error: "????????" }, { status: 400 });
    }

    const provider = getVoiceCloneProvider(body.provider);

    const { data: job, error: jobError } = await supabaseAdmin
      .from("avatar_jobs")
      .insert([
        {
          user_phone: memory.user_phone,
          memory_id,
          job_type: "voice_clone",
          provider: provider.id,
          status: "pending",
          progress: 0,
          input_url: memory.voice_sample_url,
          provider_request: {
            memory_id,
            input_url: memory.voice_sample_url,
            provider: provider.id,
          },
        },
      ])
      .select("*")
      .single();

    if (jobError || !job) {
      return Response.json(
        { error: jobError?.message || "??????????" },
        { status: 500 }
      );
    }

    await supabaseAdmin
      .from("memories")
      .update({
        voice_provider: provider.id,
        voice_clone_status: "training",
        voice_clone_error: null,
      })
      .eq("id", memory_id);

    try {
      const providerJob = await provider.createJob({
        jobId: job.id,
        memoryId: memory_id,
        voiceSampleUrl: memory.voice_sample_url,
        name: memory.name,
        relationship: memory.relationship,
        speechStyle: memory.speech_style,
      });

      const { error: providerUpdateError } = await supabaseAdmin
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

      if (providerUpdateError) {
        return Response.json(
          { error: providerUpdateError.message },
          { status: 500 }
        );
      }

      return Response.json({
        success: true,
        job_id: job.id,
        provider: providerJob.provider,
        status: providerJob.status,
        progress: providerJob.progress,
      });
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : "???????????";

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
          voice_clone_status: "failed",
          voice_clone_error: message,
        })
        .eq("id", memory_id);

      return Response.json({ error: message }, { status: 500 });
    }
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "????????";
    return Response.json({ error: message }, { status: 500 });
  }
}
