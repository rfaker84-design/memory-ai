"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";

interface AnalyticsData {
  growth: {
    dau: number; wau: number; mau: number;
    newUsersToday: number;
    channels: Array<{ channel: string; totalUsers: number; activeUsers: number; conversionRate: number }>;
  };
  stickiness: {
    total: number;
    byLevel: Record<string, number>;
    avgScore: number;
    avgChurnRisk: number;
  };
  leaderboard: Array<{ code: string; userId: string; successfulInvites: number; rewardsEarned: number }>;
  funnel: { steps: Array<{ step: string; users: number }> };
  today: { events: number; users: number };
}

export default function AnalyticsPage() {
  const router = useRouter();
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem("yijian_session");
    if (!token) { router.push("/login"); return; }

    fetch("/api/analytics/stats", { headers: { Authorization: "Bearer " + token } })
      .then(r => r.json())
      .then(setData)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [router]);

  if (loading) {
    return (
      <main className="fixed inset-0 flex items-center justify-center" style={{ background: "#0b0b0f" }}>
        <motion.div animate={{ opacity: [0.1, 0.4, 0.1] }} transition={{ duration: 2, repeat: Infinity }}
          className="w-3 h-3 rounded-full" style={{ background: "rgba(180,160,130,0.3)" }} />
      </main>
    );
  }

  const Card = ({ label, value, sub }: { label: string; value: string | number; sub?: string }) => (
    <div className="rounded-xl p-4" style={{ background: "rgba(255,255,255,0.025)", border: "0.5px solid rgba(255,255,255,0.05)" }}>
      <p style={{ color: "rgba(180,170,150,0.35)", fontSize: 11, letterSpacing: "0.05em", margin: 0 }}>{label}</p>
      <p style={{ color: "rgba(225,220,200,0.85)", fontSize: 22, fontWeight: 300, margin: "4px 0 0 0" }}>{value}</p>
      {sub && <p style={{ color: "rgba(180,170,150,0.25)", fontSize: 10, margin: "2px 0 0 0" }}>{sub}</p>}
    </div>
  );

  return (
    <main className="min-h-screen p-6 md:p-8" style={{ background: "#0b0b0f" }}>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-[20px] font-light tracking-[0.08em]" style={{ color: "rgba(225,220,200,0.8)", margin: 0 }}>
            增长分析
          </h1>
          <p className="text-[11px] tracking-[0.1em] mt-1" style={{ color: "rgba(180,170,150,0.25)", margin: 0 }}>
            V6 Growth Analytics
          </p>
        </div>
        <button onClick={() => router.push("/admin")} className="text-[11px] px-4 py-2 rounded-lg"
          style={{ color: "rgba(180,160,130,0.4)", background: "rgba(255,255,255,0.03)", border: "0.5px solid rgba(255,255,255,0.06)", cursor: "pointer" }}>
          ← 返回
        </button>
      </div>

      {/* DAU/WAU/MAU */}
      <section className="mb-8">
        <h2 className="text-[13px] font-medium tracking-[0.08em] mb-4" style={{ color: "rgba(200,190,170,0.45)", margin: 0 }}>活跃用户</h2>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <Card label="DAU" value={data?.growth.dau || 0} />
          <Card label="WAU" value={data?.growth.wau || 0} />
          <Card label="MAU" value={data?.growth.mau || 0} />
          <Card label="今日新增" value={data?.growth.newUsersToday || 0} />
          <Card label="DAU/MAU" value={data?.growth.mau ? ((data.growth.dau / data.growth.mau) * 100).toFixed(0) + "%" : "0%"} />
        </div>
      </section>

      {/* Stickiness */}
      <section className="mb-8">
        <h2 className="text-[13px] font-medium tracking-[0.08em] mb-4" style={{ color: "rgba(200,190,170,0.45)", margin: 0 }}>用户依赖度</h2>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <Card label="总用户" value={data?.stickiness.total || 0} />
          <Card label="上瘾用户" value={data?.stickiness.byLevel?.dependent || 0} />
          <Card label="情感依附" value={data?.stickiness.byLevel?.attached || 0} />
          <Card label="平均依赖分" value={data?.stickiness.avgScore || 0} />
          <Card label="流失风险" value={((data?.stickiness.avgChurnRisk || 0) * 100).toFixed(0) + "%"} />
        </div>
      </section>

      {/* Channels */}
      <section className="mb-8">
        <h2 className="text-[13px] font-medium tracking-[0.08em] mb-4" style={{ color: "rgba(200,190,170,0.45)", margin: 0 }}>渠道分布</h2>
        <div className="space-y-2">
          {(data?.growth.channels || []).map(ch => (
            <div key={ch.channel} className="flex items-center gap-4 rounded-lg p-3"
              style={{ background: "rgba(255,255,255,0.02)", border: "0.5px solid rgba(255,255,255,0.04)" }}>
              <span style={{ color: "rgba(225,220,200,0.7)", fontSize: 13, minWidth: 70 }}>{ch.channel}</span>
              <div className="flex-1 h-1 rounded-full" style={{ background: "rgba(255,255,255,0.06)" }}>
                <div className="h-1 rounded-full" style={{
                  width: Math.min(100, (ch.totalUsers / Math.max(...(data?.growth.channels || []).map(c => c.totalUsers), 1)) * 100) + "%",
                  background: "rgba(180,160,130,0.6)",
                }} />
              </div>
              <span style={{ color: "rgba(180,170,150,0.35)", fontSize: 11 }}>{ch.totalUsers}人 · {ch.conversionRate.toFixed(1)}%转化</span>
            </div>
          ))}
        </div>
      </section>

      {/* Referral Leaderboard */}
      <section className="mb-8">
        <h2 className="text-[13px] font-medium tracking-[0.08em] mb-4" style={{ color: "rgba(200,190,170,0.45)", margin: 0 }}>邀请排行榜</h2>
        <div className="space-y-2">
          {(data?.leaderboard || []).slice(0, 5).map((r, i) => (
            <div key={r.userId} className="flex items-center gap-3 rounded-lg p-3"
              style={{ background: i === 0 ? "rgba(180,160,130,0.06)" : "rgba(255,255,255,0.02)", border: "0.5px solid rgba(255,255,255,0.04)" }}>
              <span style={{ color: i === 0 ? "rgba(220,200,140,0.7)" : "rgba(180,170,150,0.4)", fontSize: 14, minWidth: 24 }}>
                #{i + 1}
              </span>
              <span style={{ color: "rgba(225,220,200,0.6)", fontSize: 12 }}>{r.userId.slice(0, 12)}...</span>
              <span style={{ color: "rgba(180,170,150,0.3)", fontSize: 11, marginLeft: "auto" }}>
                {r.successfulInvites}次邀请 · {r.rewardsEarned}奖励
              </span>
            </div>
          ))}
        </div>
      </section>

      {/* Today */}
      <section>
        <h2 className="text-[13px] font-medium tracking-[0.08em] mb-4" style={{ color: "rgba(200,190,170,0.45)", margin: 0 }}>今日概览</h2>
        <div className="grid grid-cols-2 gap-3">
          <Card label="今日事件" value={data?.today.events || 0} />
          <Card label="活跃用户" value={data?.today.users || 0} />
        </div>
      </section>
    </main>
  );
}
