"use client";

import { useState } from "react";
import Link from "next/link";

export default function LoginPage() {
  const [agreed, setAgreed] = useState(false);
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [devCode, setDevCode] = useState("");
  const [loading, setLoading] = useState(false);

  const disabled = !agreed || loading;

  const sendCode = async () => {
    if (!agreed) return alert("请先阅读并同意相关协议");
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
    if (!agreed) return alert("请先阅读并同意相关协议");
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
    <main className="relative min-h-screen overflow-hidden bg-[#050506] px-6 pb-10 pt-12 text-white">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_10%,rgba(255,220,180,0.18),transparent_32%),radial-gradient(circle_at_50%_42%,rgba(255,210,160,0.10),transparent_36%),linear-gradient(180deg,#070707,#020203)]" />
      <div className="absolute left-1/2 top-24 h-52 w-52 -translate-x-1/2 rounded-full bg-white/10 blur-3xl" />
      <div className="absolute left-1/2 top-28 h-36 w-24 -translate-x-1/2 rounded-full border border-white/15 bg-white/[0.03] blur-[1px] shadow-[0_0_70px_rgba(255,230,200,0.2)]" />

      <section className="relative z-10 mx-auto flex min-h-[calc(100vh-5rem)] max-w-[430px] flex-col justify-end">
        <div className="mb-12 text-center">
          <p className="mb-3 text-xs tracking-[0.45em] text-white/45">YIJIAN MEMORY</p>
          <h1 className="text-4xl font-light tracking-[0.2em]">忆见</h1>
          <p className="mt-5 text-sm leading-7 text-white/58">
            在被允许的记忆里，重新遇见想念的人。
          </p>
        </div>

        <div className="rounded-[32px] border border-white/10 bg-white/[0.055] p-5 shadow-[0_24px_80px_rgba(0,0,0,0.38)] backdrop-blur-2xl">
          <label className="text-xs tracking-[0.22em] text-white/45">手机号登录</label>
          <div className="mt-3 flex items-center gap-3 rounded-2xl border border-white/10 bg-black/25 px-4 py-4">
            <span className="text-white/50">+86</span>
            <input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="请输入手机号"
              className="w-full bg-transparent text-[15px] text-white outline-none placeholder:text-white/25"
            />
          </div>

          <button
            onClick={sendCode}
            disabled={disabled}
            className={`mt-4 h-13 w-full rounded-2xl text-[15px] tracking-[0.18em] transition ${
              disabled
                ? "cursor-not-allowed bg-white/10 text-white/30"
                : "bg-white text-black shadow-[0_0_32px_rgba(255,255,255,0.18)]"
            }`}
          >
            {loading ? "处理中..." : "获取验证码"}
          </button>

          {devCode && (
            <div className="mt-4 rounded-2xl border border-white/10 bg-white/[0.06] p-3 text-center text-sm text-white/65">
              内测验证码：{devCode}
            </div>
          )}

          <div className="mt-4 rounded-2xl border border-white/10 bg-black/25 px-4 py-4">
            <input
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="请输入验证码"
              className="w-full bg-transparent text-[15px] text-white outline-none placeholder:text-white/25"
            />
          </div>

          <button
            onClick={login}
            disabled={disabled}
            className={`mt-4 h-13 w-full rounded-2xl text-[15px] tracking-[0.18em] transition ${
              disabled
                ? "cursor-not-allowed bg-white/10 text-white/30"
                : "bg-white text-black shadow-[0_0_32px_rgba(255,255,255,0.18)]"
            }`}
          >
            登录
          </button>

          <div className="my-5 flex items-center gap-3 text-xs text-white/28">
            <span className="h-px flex-1 bg-white/10" />
            其他登录方式
            <span className="h-px flex-1 bg-white/10" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <button
              disabled={!agreed}
              className="h-12 rounded-2xl border border-white/10 bg-white/[0.06] text-sm text-white/70 disabled:cursor-not-allowed disabled:text-white/25"
            >
              微信登录
            </button>
            <button
              disabled={!agreed}
              className="h-12 rounded-2xl border border-white/10 bg-white/[0.06] text-sm text-white/70 disabled:cursor-not-allowed disabled:text-white/25"
            >
              Apple 登录
            </button>
          </div>

          <label className="mt-5 flex items-start gap-3 text-xs leading-6 text-white/48">
            <input
              type="checkbox"
              checked={agreed}
              onChange={(e) => setAgreed(e.target.checked)}
              className="mt-1 h-4 w-4 accent-white"
            />
            <span>
              我已阅读并同意
              <Link href="/terms" className="mx-1 text-white/78 underline underline-offset-4">
                用户协议
              </Link>
              和
              <Link href="/privacy" className="mx-1 text-white/78 underline underline-offset-4">
                隐私声明
              </Link>
              ，理解忆见涉及肖像、声音、亲属授权与 AI 生成内容说明。
            </span>
          </label>

          {!agreed && (
            <p className="mt-3 text-center text-xs text-white/32">
              请先勾选授权协议，才可以使用忆见功能。
            </p>
          )}
        </div>
      </section>
    </main>
  );
}
