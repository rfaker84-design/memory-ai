"use client";

import { useState } from "react";

export default function LoginPage() {
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [devCode, setDevCode] = useState("");
  const [loading, setLoading] = useState(false);

  const sendCode = async () => {
    if (!phone.trim()) return alert("请输入手机号");

    setLoading(true);

    const res = await fetch("/api/send-code", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ phone }),
    });

    const data = await res.json();

    setLoading(false);

    if (!res.ok) {
      alert(data.error || "发送失败");
      return;
    }

    setDevCode(data.code);
    alert("验证码已生成");
  };

  const login = async () => {
    if (!phone.trim() || !code.trim()) {
      alert("请输入手机号和验证码");
      return;
    }

    setLoading(true);

    const res = await fetch("/api/verify-code", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ phone, code }),
    });

    const data = await res.json();

    setLoading(false);

    if (!res.ok) {
      alert(data.error || "登录失败");
      return;
    }

    localStorage.setItem("yijian_phone", data.phone);

    alert("登录成功");
    window.location.href = "/memories";
  };

  return (
    <main className="flex min-h-screen items-center justify-center bg-neutral-50 px-6">
      <div className="w-full max-w-md rounded-2xl bg-white p-8 shadow-sm">
        <h1 className="text-3xl font-bold">忆见登录</h1>

        <p className="mt-2 text-neutral-500">
          手机号登录
        </p>

        <input
          className="mt-6 w-full rounded-lg border p-3"
          placeholder="请输入手机号"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
        />

        <button
          onClick={sendCode}
          disabled={loading}
          className="mt-4 w-full rounded-lg bg-black py-3 text-white disabled:opacity-50"
        >
          {loading ? "处理中..." : "获取验证码"}
        </button>

        {devCode && (
          <div className="mt-4 rounded-lg bg-yellow-50 p-3 text-sm text-yellow-800">
            内测验证码：{devCode}
          </div>
        )}

        <input
          className="mt-4 w-full rounded-lg border p-3"
          placeholder="请输入验证码"
          value={code}
          onChange={(e) => setCode(e.target.value)}
        />

        <button
          onClick={login}
          disabled={loading}
          className="mt-4 w-full rounded-lg bg-blue-600 py-3 text-white disabled:opacity-50"
        >
          登录
        </button>
      </div>
    </main>
  );
}
