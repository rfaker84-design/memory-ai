
import { createClient } from "@supabase/supabase-js";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export async function POST(request: Request) {
  try {
    const body = await request.json();

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

    await supabaseAdmin
      .from("avatar_jobs")
      .update({
        status: "processing",
        provider: "adapter_v1",
        provider_response: {
          message: "数字人厂商适配层已接管任务",
          job_type: job.job_type,
          input_url: job.input_url,
        },
        updated_at: new Date().toISOString(),
      })
      .eq("id", job_id);

    return Response.json({
      success: true,
      job_id,
      status: "processing",
    });
  } catch (error) {
    console.error(error);
    return Response.json({ error: "数字人适配层启动失败" }, { status: 500 });
  }
}