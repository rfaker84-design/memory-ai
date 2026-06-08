"use client";

import { useState } from "react";
import { supabase } from "../../src/lib/supabase";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);

  const handleLogin = async () => {
    if (!email.trim()) {
      alert("请输入邮箱");
      return;
    }

    setLoading(true);

    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: "http://localhost:3000",
      },
    });

    setLoading(false);

    if (error) {
      alert("发送失败：" + error.message);
      return;
    }

    alert("登录链接已发送到邮箱");
  };

  return (
    <main className="flex min-h-screen items-center justify-center bg-neutral-100">
      <div className="w-full max-w-md rounded-2xl bg-white p-8 shadow">
        <h1 className="mb-6 text-center text-3xl font-bold">
          登录忆见 AI
        </h1>

        <input
          type="email"
          placeholder="请输入邮箱"
          className="w-full rounded-lg border p-3"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />

        <button
          onClick={handleLogin}
          disabled={loading}
          className="mt-4 w-full rounded-lg bg-black px-4 py-3 text-white"
        >
          {loading ? "发送中..." : "发送登录链接"}
        </button>

        <p className="mt-4 text-center text-sm text-neutral-500">
          通过邮箱验证码登录
        </p>
      </div>
    </main>
  );
}