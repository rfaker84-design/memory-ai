"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import BottomNav from "@/components/BottomNav";

export default function ProfilePage() {
  const [phone, setPhone] = useState("");

  useEffect(() => {
    const savedPhone = window.localStorage.getItem("yijian_phone");
    if (!savedPhone) {
      window.location.href = "/login";
      return;
    }
    setPhone(savedPhone);
  }, []);

  const logout = () => {
    window.localStorage.removeItem("yijian_phone");
    alert("已退出登录");
    window.location.href = "/login";
  };

  const items = [
    { label: "我的记忆体", href: "/memories" },
    { label: "创建记忆体", href: "/create-memory" },
    { label: "用户协议", href: "/terms" },
    { label: "隐私声明", href: "/privacy" },
  ];

  return (
    <main className="relative min-h-screen overflow-hidden bg-[#02030a] px-5 pb-28 pt-10 text-white">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_16%,rgba(160,190,255,0.16),transparent_34%),linear-gradient(180deg,#050713,#010106)]" />
      <section className="relative z-10 mx-auto max-w-[430px]">
        <p className="text-xs tracking-[0.42em] text-white/38">PROFILE</p>
        <h1 className="mt-5 text-3xl font-light tracking-[0.18em]">我的</h1>

        <div className="mt-8 rounded-[34px] border border-white/10 bg-white/[0.055] p-6 backdrop-blur-2xl">
          <div className="h-16 w-16 rounded-full border border-white/15 bg-white/10" />
          <h2 className="mt-5 text-xl font-light">忆见用户</h2>
          <p className="mt-2 text-sm text-white/42">{phone || "账号、授权、隐私与安全管理"}</p>
        </div>

        <div className="mt-5 space-y-3">
          {items.map((item) => (
            <Link
              key={item.label}
              href={item.href}
              className="flex h-14 items-center justify-between rounded-2xl border border-white/10 bg-white/[0.045] px-5 text-sm text-white/70 backdrop-blur-xl"
            >
              {item.label}
              <span className="text-white/28">›</span>
            </Link>
          ))}

          <button
            onClick={logout}
            className="flex h-14 w-full items-center justify-between rounded-2xl border border-white/10 bg-white/[0.045] px-5 text-sm text-white/70 backdrop-blur-xl"
          >
            退出登录
            <span className="text-white/28">›</span>
          </button>
        </div>
      </section>
      <BottomNav />
    </main>
  );
}

