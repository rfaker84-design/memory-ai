import { createClient } from "@/src/server/legacy-supabase";
import { PLANS, getUserPlan, analyzeConversionReadiness, type PlanType } from "../../../../src/lib/subscription";
import { getUserDependencyProfile } from "../../../../src/lib/emotion-dependency";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const userPhone = searchParams.get("user_phone");

  if (!userPhone) {
    return Response.json({ error: "缺少 user_phone" }, { status: 400 });
  }

  try {
    const { plan, voiceQuality, videoQuality } = await getUserPlan(userPhone);
    const currentPlan = PLANS[plan];

    // Get emotion intensity history
    let intensityHistory: number[] = [];
    try {
      const { data: recentMsgs } = await supabaseAdmin
        .from("chat_messages")
        .select("emotion, created_at")
        .eq("user_phone", userPhone)
        .eq("role", "user")
        .order("created_at", { ascending: false })
        .limit(20);

      const hour = new Date().getHours();
      intensityHistory = (recentMsgs || []).map(function(r: { emotion?: string }) {
        let intensity = 0;
        const emotion = r.emotion || "neutral";
        if (emotion === "sad" || emotion === "lonely") intensity = 0.5;
        if (hour >= 22 || hour < 2) intensity += 0.2;
        return Math.min(1, intensity);
      });
    } catch { intensityHistory = []; }

    // Get dependency
    const depProfile = await getUserDependencyProfile(userPhone);

    // Conversion recommendation
    const recommendation = analyzeConversionReadiness({
      currentPlan: plan,
      emotionIntensityHistory: intensityHistory,
      nightUsage: new Date().getHours() >= 22 || new Date().getHours() < 5,
      consecutiveDays: 1,
      chatCountToday: intensityHistory.length,
      dependencyScore: depProfile?.score || 0,
    });

    return Response.json({
      subscription: {
        plan,
        price: currentPlan.price,
        voice_quality: voiceQuality,
        video_quality: videoQuality,
        features: currentPlan.features,
      },
      upgrade: recommendation.shouldRecommend ? {
        target: recommendation.targetPlan,
        price: recommendation.targetPrice,
        title: recommendation.title,
        description: recommendation.description,
        cta: recommendation.cta,
        reasons: recommendation.reasons,
        urgency: recommendation.urgency,
      } : null,
      dependency: depProfile ? {
        score: depProfile.score,
        level: depProfile.level,
      } : null,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "查询失败";
    return Response.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const { user_phone, target_plan } = await request.json();

    if (!user_phone || !target_plan) {
      return Response.json({ error: "缺少 user_phone 或 target_plan" }, { status: 400 });
    }

    if (!["free", "pro", "premium"].includes(target_plan)) {
      return Response.json({ error: "无效的套餐类型" }, { status: 400 });
    }

    await supabaseAdmin
      .from("user_settings")
      .upsert({
        user_phone,
        subscription_type: target_plan,
        updated_at: new Date().toISOString(),
      }, { onConflict: "user_phone" });

    const plan = PLANS[target_plan as PlanType];

    return Response.json({
      success: true,
      plan: target_plan,
      price: plan.price,
      features: plan.features,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "升级失败";
    return Response.json({ error: message }, { status: 500 });
  }
}
