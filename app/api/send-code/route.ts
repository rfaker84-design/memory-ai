import { createClient } from "@supabase/supabase-js";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

type SendCodeRequest = {
  phone?: string;
};

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as SendCodeRequest;
    const phone = String(body.phone || "").trim();

    if (!phone) {
      return Response.json({ error: "请输入手机号" }, { status: 400 });
    }

    const code = Math.floor(100000 + Math.random() * 900000).toString();

    const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString();

    await supabaseAdmin.from("sms_codes").insert([
      {
        phone,
        code,
        expires_at: expiresAt,
        used: false,
      },
    ]);

    return Response.json({
      success: true,
      code,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "验证码发送失败";
    return Response.json(
      { error: message },
      { status: 500 }
    );
  }
}
