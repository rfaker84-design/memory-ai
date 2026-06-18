/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars, prefer-const */
import { supabaseAdmin } from "@/src/server/supabaseAdmin";

export async function GET() {
  const checks: Record<string, string> = {};
  let healthy = true;

  // Check Supabase
  try {
    const { data, error } = await supabaseAdmin
      .from("memories")
      .select("id")
      .limit(1);
    if (error) {
      checks.supabase = "error: " + error.message;
      healthy = false;
    } else {
      checks.supabase = "ok";
    }
  } catch {
    checks.supabase = "unreachable";
    healthy = false;
  }

  // Check DeepSeek
  if (process.env.DEEPSEEK_API_KEY) {
    checks.deepseek = "configured";
  } else {
    checks.deepseek = "missing";
    healthy = false;
  }

  // Check Tencent Cloud
  if (process.env.TENCENT_SECRET_ID && process.env.TENCENT_SECRET_KEY) {
    checks.tencent_cloud = "configured";
  } else {
    checks.tencent_cloud = "missing";
    healthy = false;
  }

  // Check COS
  if (process.env.COS_BUCKET) {
    checks.cos = "configured";
  } else {
    checks.cos = "missing";
    healthy = false;
  }

  // Check voice clone provider
  checks.voice_clone = process.env.VOICE_CLONE_PROVIDER || "manual_v1 (default)";

  // Check avatar provider
  checks.avatar = process.env.AVATAR_PROVIDER || "adapter_v1 (default)";

  return Response.json(
    {
      success: healthy,
      status: healthy ? "healthy" : "degraded",
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      version: process.env.npm_package_version || "0.1.0",
      checks,
    },
    { status: healthy ? 200 : 503 }
  );
}