"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";

interface AdminStats {
  users: { total: number; free: number; pro: number; vip: number; activeToday: number };
  revenue: { todayYuan: string; monthYuan: string; totalYuan: string; orderCount: number };
  system: { totalCalls: number; todayCostYuan: string; totalCostYuan: string };
  queue: { queued: number; processing: number };
  tenants: { total: number; active: number; enterprise: number };
  sessions: { active: number; total: number };
  cache: {
    llm: { hits: number; misses: number; hitRate: number; size: number };
    tts: { hits: number; misses: number; hitRate: number; size: number };
    avatar: { generations: number; hits: number; hotSize: number };
  };
}

export default function AdminPage() {
  const router = useRouter();
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const token = localStorage.getItem("yijian_session");
    if (!token) { router.push("/login"); return; }

    fetch("/api/admin/stats", {
      headers: { Authorization: "Bearer " + token },
    })
      .then(r => {
        if (!r.ok) throw new Error("无权限");
        return r.json();
      })
      .then(setStats)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, [router]);

  if (loading) {
    return (
      <main className="fixed inset-0 flex items-center justify-center" style={{ background: "#0b0b0f" }}>
        <motion.div
          animate={{ opacity: [0.1, 0.5, 0.1] }}
          transition={{ duration: 2, repeat: Infinity }}
          className="w-3 h-3 rounded-full"
          style={{ background: "rgba(180,160,130,0.3)" }}
        />
      </main>
    );
  }

  if (error) {
    return (
      <main className="fixed inset-0 flex items-center justify-center" style={{ background: "#0b0b0f" }}>
        <p style={{ color: "rgba(180,150,130,0.5)" }}>{error}</p>
      </main>
    );
  }

  if (!stats) return null;

  const StatCard = ({ label, value, sub }: { label: string; value: string | number; sub?: string }) => (
    <div
      className="rounded-xl p-5"
      style={{
        background: "rgba(255,255,255,0.03)",
        border: "0.5px solid rgba(255,255,255,0.06)",
      }}
    >
      <p style={{ color: "rgba(180,170,150,0.4)", fontSize: 12, letterSpacing: "0.05em", margin: 0 }}>{label}</p>
      <p style={{ color: "rgba(225,220,200,0.85)", fontSize: 28, fontWeight: 300, margin: "8px 0 0 0" }}>{value}</p>
      {sub && <p style={{ color: "rgba(180,170,150,0.3)", fontSize: 11, margin: "4px 0 0 0" }}>{sub}</p>}
    </div>
  );

  return (
    <main className="min-h-screen p-6 md:p-10" style={{ background: "#0b0b0f" }}>
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-[22px] font-light tracking-[0.08em]" style={{ color: "rgba(225,220,200,0.85)", margin: 0 }}>
            忆见管理后台
          </h1>
          <p className="text-[12px] tracking-[0.1em] mt-1" style={{ color: "rgba(180,170,150,0.3)", margin: 0 }}>
            Memory AI Admin · V4 SaaS
          </p>
        </div>
        <button
          onClick={() => router.push("/")}
          className="text-[12px] tracking-[0.06em] px-4 py-2 rounded-lg"
          style={{
            color: "rgba(180,170,150,0.4)",
            background: "rgba(255,255,255,0.03)",
            border: "0.5px solid rgba(255,255,255,0.06)",
            cursor: "pointer",
          }}
        >
          ← 返回首页
        </button>
      </div>

      {/* User Stats */}
      <section className="mb-8">
        <h2 className="text-[14px] font-medium tracking-[0.08em] mb-4" style={{ color: "rgba(200,190,170,0.5)", margin: 0 }}>
          用户统计
        </h2>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <StatCard label="总用户" value={stats.users.total} />
          <StatCard label="今日活跃" value={stats.users.activeToday} />
          <StatCard label="免费用户" value={stats.users.free} />
          <StatCard label="Pro 用户" value={stats.users.pro} />
          <StatCard label="VIP 用户" value={stats.users.vip} />
        </div>
      </section>

      {/* Revenue Stats */}
      <section className="mb-8">
        <h2 className="text-[14px] font-medium tracking-[0.08em] mb-4" style={{ color: "rgba(200,190,170,0.5)", margin: 0 }}>
          收入统计
        </h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <StatCard label="今日收入" value={"¥" + stats.revenue.todayYuan} />
          <StatCard label="本月收入" value={"¥" + stats.revenue.monthYuan} />
          <StatCard label="累计收入" value={"¥" + stats.revenue.totalYuan} />
          <StatCard label="订单数" value={stats.revenue.orderCount} />
        </div>
      </section>

      {/* System Stats */}
      <section className="mb-8">
        <h2 className="text-[14px] font-medium tracking-[0.08em] mb-4" style={{ color: "rgba(200,190,170,0.5)", margin: 0 }}>
          系统运行
        </h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <StatCard label="总 API 调用" value={stats.system.totalCalls} />
          <StatCard label="今日成本" value={"¥" + stats.system.todayCostYuan} />
          <StatCard label="累计成本" value={"¥" + stats.system.totalCostYuan} />
          <StatCard label="队列中" value={stats.queue.queued} sub={"处理中: " + stats.queue.processing} />
        </div>
      </section>

      {/* Cache Stats */}
      <section className="mb-8">
        <h2 className="text-[14px] font-medium tracking-[0.08em] mb-4" style={{ color: "rgba(200,190,170,0.5)", margin: 0 }}>
          缓存效率
        </h2>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          <StatCard
            label="LLM 缓存"
            value={(stats.cache.llm.hitRate * 100).toFixed(0) + "%"}
            sub={"命中 " + stats.cache.llm.hits + " / 未命中 " + stats.cache.llm.misses}
          />
          <StatCard
            label="TTS 缓存"
            value={(stats.cache.tts.hitRate * 100).toFixed(0) + "%"}
            sub={"缓存 " + stats.cache.tts.size + " 条"}
          />
          <StatCard
            label="Avatar 缓存"
            value={stats.cache.avatar.hotSize}
            sub={"生成 " + stats.cache.avatar.generations + " / 命中 " + stats.cache.avatar.hits}
          />
        </div>
      </section>

      {/* Tenant Stats */}
      <section>
        <h2 className="text-[14px] font-medium tracking-[0.08em] mb-4" style={{ color: "rgba(200,190,170,0.5)", margin: 0 }}>
          租户概览
        </h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <StatCard label="租户总数" value={stats.tenants.total} />
          <StatCard label="活跃租户" value={stats.tenants.active} />
          <StatCard label="企业租户" value={stats.tenants.enterprise} />
          <StatCard label="活跃 Session" value={stats.sessions.active} sub={"总计: " + stats.sessions.total} />
        </div>
      </section>
    </main>
  );
}
