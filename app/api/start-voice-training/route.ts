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
      .select("voice_sample_url")
      .eq("id", memory_id)
      .single();

    if (memoryError || !memory?.voice_sample_url) {
      return Response.json({ error: "请先上传声音样本" }, { status: 400 });
    }

    const { error: jobError } = await supabaseAdmin.from("avatar_jobs").insert([
      {
        memory_id,
        job_type: "voice_clone",
        provider: "manual_v1",
        status: "pending",
        input_url: memory.voice_sample_url,
      },
    ]);

    if (jobError) {
      return Response.json({ error: jobError.message }, { status: 500 });
    }

    const { error: updateError } = await supabaseAdmin
      .from("memories")
      .update({
        voice_clone_status: "training",
      })
      .eq("id", memory_id);

    if (updateError) {
      return Response.json({ error: updateError.message }, { status: 500 });
    }

    return Response.json({ success: true });
  } catch {
    return Response.json({ error: "启动声音训练失败" }, { status: 500 });
  }
}
