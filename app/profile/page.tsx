"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
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

    const secondConfirm = prompt(
      "请输入你的手机号以确认删除全部数据"
    );

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
      await supabase
        .from("chat_messages")
        .delete()
        .in("memory_id", memoryIds);

      await supabase
        .from("timeline_events")
        .delete()
        .in("memory_id", memoryIds);

      await supabase
        .from("memories")
        .delete()
        .eq("user_phone", phone);
    }

    await supabase
      .from("users_profile")
      .delete()
      .eq("phone", phone);

    setDeleting(false);

    window.localStorage.removeItem("yijian_phone");

    alert("你的全部数据已删除");
    window.location.href = "/login";
  };

  return (
    <main className="min-h-screen bg-neutral-50 px-6 py-12">
      <div className="mx-auto max-w-2xl rounded-2xl bg-white p-8 shadow-sm">
        <h1 className="text-3xl font-bold">用户中心</h1>

        <div className="mt-6 rounded-xl bg-neutral-100 p-4">
          <p className="text-sm text-neutral-500">当前手机号</p>
          <p className="mt-1 text-xl font-semibold">{phone}</p>
        </div>

        <div className="mt-8 flex flex-col gap-3">
          <Link
            href="/memories"
            className="rounded-lg bg-black px-6 py-3 text-center text-white"
          >
            我的记忆体
          </Link>

          <Link
            href="/create-memory"
            className="rounded-lg bg-blue-600 px-6 py-3 text-center text-white"
          >
            创建记忆体
          </Link>

          <button
            onClick={logout}
            className="rounded-lg bg-neutral-700 px-6 py-3 text-white"
          >
            退出登录
          </button>

          <button
            onClick={deleteAllData}
            disabled={deleting}
            className="rounded-lg bg-red-600 px-6 py-3 text-white disabled:opacity-50"
          >
            {deleting ? "删除中..." : "删除我的全部数据"}
          </button>
        </div>

        <p className="mt-8 text-sm leading-6 text-neutral-500">
          删除数据后，你创建的记忆体、时间线和聊天记录将被清除，且无法恢复。
        </p>
      </div>
    </main>
  );
}
