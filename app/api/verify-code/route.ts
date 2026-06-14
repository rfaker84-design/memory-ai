import { createClient } from "@supabase/supabase-js";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

type VerifyCodeRequest = {
  phone?: string;
  code?: string;
};

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as VerifyCodeRequest;
    const phone = String(body.phone || "").trim();
    const code = String(body.code || "").trim();

    if (!phone || !code) {
      return Response.json({ error: "请输入手机号和验证码" }, { status: 400 });
    }

    const { data, error } = await supabaseAdmin
      .from("sms_codes")
      .select("*")
      .eq("phone", phone)
      .eq("code", code)
      .eq("used", false)
      .gt("expires_at", new Date().toISOString())
      .order("created_at", { ascending: false })
      .limit(1)
      .single();

    if (error || !data) {
      return Response.json({ error: "验证码错误或已过期" }, { status: 400 });
    }

    await supabaseAdmin
      .from("sms_codes")
      .update({ used: true })
      .eq("id", data.id);

    await supabaseAdmin.from("users_profile").upsert(
      [
        {
          phone,
        },
      ],
      { onConflict: "phone" }
    );

    return Response.json({
      success: true,
      phone,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "登录失败";
    return Response.json(
      { error: message },
      { status: 500 }
    );
  }
}
