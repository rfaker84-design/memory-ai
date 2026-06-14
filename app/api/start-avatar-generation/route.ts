import { createClient } from "@supabase/supabase-js";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { memory_id } = body;

    if (!memory_id) {
      return Response.json({ error: "缺少 memory_id" }, { status: 400 });
    }

    const { data: memory, error: memoryError } = await supabaseAdmin
      .from("memories")
      .select("photo_url")
      .eq("id", memory_id)
      .single();

    if (memoryError || !memory?.photo_url) {
      return Response.json({ error: "请先上传照片" }, { status: 400 });
    }

    const { data: job, error: jobError } = await supabaseAdmin
      .from("avatar_jobs")
      .insert([
        {
          memory_id,
          job_type: "avatar_video",
          provider: "adapter_v1",
          status: "pending",
          input_url: memory.photo_url,
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

    await supabaseAdmin
      .from("memories")
      .update({
        avatar_status: "generating",
        avatar_job_id: job.id,
        avatar_provider: "adapter_v1",
      })
      .eq("id", memory_id);

    return Response.json({
      success: true,
      job_id: job.id,
    });
  } catch {
    return Response.json({ error: "启动数字人生成失败" }, { status: 500 });
  }
}
