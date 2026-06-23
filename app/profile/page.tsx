"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import BottomNav from "@/components/BottomNav";
import { supabase } from "../../src/lib/supabase";

export default function ProfilePage() {
  const [phone, setPhone] = useState("");
  const [deleting, setDeleting] = useState(false);

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

  const deleteAllData = async () => {
    if (!phone) return;

    const firstConfirm = confirm(
      "确认删除你的全部数据？包括所有记忆体、时间线和聊天记录。此操作不可恢复。"
    );

    if (!firstConfirm) return;

    const secondConfirm = prompt("请输入你的手机号以确认删除全部数据");

    if (secondConfirm !== phone) {
      alert("手机号不一致，已取消删除");
      return;
    }

    setDeleting(true);

    const { data: memories } = await supabase
      .from("memories")
      .select("id")
      .eq("user_phone", phone);

    const memoryIds = (memories || []).map((item) => item.id);

    if (memoryIds.length > 0) {
      await supabase.from("chat_messages").delete().in("memory_id", memoryIds);
      await supabase.from("timeline_events").delete().in("memory_id", memoryIds);
      await supabase.from("memories").delete().eq("user_phone", phone);
    }

    await supabase.from("users_profile").delete().eq("phone", phone);

    setDeleting(false);

    window.localStorage.removeItem("yijian_phone");

    alert("你的全部数据已删除");
    window.location.href = "/login";
  };

  const links = [
    { label: "我的记忆体", href: "/memories" },
    { label: "创建记忆体", href: "/create-memory" },
    { label: "隐私声明", href: "/privacy" },
    { label: "用户协议", href: "/terms" },
  ];

  return (
    <main className="relative min-h-screen overflow-hidden bg-[#050506] px-5 pb-28 pt-10 text-white">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_12%,rgba(255,225,190,0.13),transparent_32%),linear-gradient(180deg,#070707,#020203)]" />

      <section className="relative z-10 mx-auto max-w-[430px]">
        <p className="text-xs tracking-[0.4em] text-white/38">PROFILE</p>
        <h1 className="mt-4 text-3xl font-light tracking-[0.18em]">我的</h1>

        <div className="mt-8 rounded-[34px] border border-white/10 bg-white/[0.055] p-6 backdrop-blur-2xl">
          <div className="h-16 w-16 rounded-full border border-white/15 bg-white/10" />
          <h2 className="mt-5 text-xl font-light">忆见用户</h2>
          <p className="mt-2 text-sm text-white/42">
            {phone || "授权、隐私、安全与账号管理"}
          </p>
        </div>

        <div className="mt-5 space-y-3">
          {links.map((item) => (
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

          <button
            onClick={deleteAllData}
            disabled={deleting}
            className="flex h-14 w-full items-center justify-between rounded-2xl border border-red-400/20 bg-red-500/10 px-5 text-sm text-red-100/80 backdrop-blur-xl disabled:opacity-50"
          >
            {deleting ? "删除中..." : "删除与导出数据"}
            <span className="text-red-100/30">›</span>
          </button>
        </div>
      </section>

      <BottomNav />
    </main>
  );
}
