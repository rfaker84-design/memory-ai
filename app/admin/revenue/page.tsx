"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";

interface RevenueData {
  conversion: { freeToProRate: number; proToVipRate: number; avgDaysToConvert: number; topTriggerEmotion: string; bestTimeOfDay: number };
  progress: { totalUsers: number; avgLevel: number; levelDistribution: Record<string, number> };
  stickiness: { total: number; avgScore: number; byLevel: Record<string, number> };
  loop: { phases: Record<string, number>; avgLoopsToAddiction: number };
  revenue: { todayYuan: string; monthYuan: string; totalYuan: string; orderCount: number };
}

export default function RevenuePage() {
  const router = useRouter();
  const [data, setData] = useState<RevenueData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem("yijian_session");
    if (!token) { router.push("/login"); return; }
    fetch("/api/revenue/stats", { headers: { Authorization: "Bearer " + token } })
      .then(r => r.json()).then(setData).catch(() => {}).finally(() => setLoading(false));
  }, [router]);

  if (loading) {
    return (
      <main className="fixed inset-0 flex items-center justify-center" style={{ background: "#0b0b0f" }}>
        <motion.div animate={{ opacity: [0.1, 0.4, 0.1] }} transition={{ duration: 2, repeat: Infinity }}
          className="w-3 h-3 rounded-full" style={{ background: "rgba(180,160,130,0.3)" }} />
      </main>
    );
  }

  const Card = ({ label, value, sub, color }: { label: string; value: string | number; sub?: string; color?: string }) => (
    <div className="rounded-xl p-4" style={{ background: "rgba(255,255,255,0.025)", border: "0.5px solid rgba(255,255,255,0.05)" }}>
      <p style={{ color: "rgba(180,170,150,0.35)", fontSize: 11, letterSpacing: "0.05em", margin: 0 }}>{label}</p>
      <p style={{ color: color || "rgba(225,220,200,0.85)", fontSize: 24, fontWeight: 300, margin: "4px 0 0 0" }}>{value}</p>
      {sub && <p style={{ color: "rgba(180,170,150,0.25)", fontSize: 10, margin: "2px 0 0 0" }}>{sub}</p>}
    </div>
  );

  return (
    <main className="min-h-screen p-6 md:p-8" style={{ background: "#0b0b0f" }}>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-[20px] font-light tracking-[0.08em]" style={{ color: "rgba(225,220,200,0.8)", margin: 0 }}>收入引擎</h1>
          <p className="text-[11px] tracking-[0.1em] mt-1" style={{ color: "rgba(180,170,150,0.25)", margin: 0 }}>V7 Revenue Dashboard</p>
        </div>
        <button onClick={() => router.push("/admin")} className="text-[11px] px-4 py-2 rounded-lg"
          style={{ color: "rgba(180,160,130,0.4)", background: "rgba(255,255,255,0.03)", border: "0.5px solid rgba(255,255,255,0.06)", cursor: "pointer" }}>← 返回</button>
      </div>

      {/* Revenue */}
      <section className="mb-8">
        <h2 className="text-[13px] font-medium tracking-[0.08em] mb-4" style={{ color: "rgba(200,190,170,0.45)", margin: 0 }}>收入概览</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Card label="今日收入" value={"¥" + (data?.revenue.todayYuan || "0")} color="rgba(140,200,120,0.85)" />
          <Card label="本月收入" value={"¥" + (data?.revenue.monthYuan || "0")} />
          <Card label="累计收入" value={"¥" + (data?.revenue.totalYuan || "0")} />
          <Card label="订单数" value={data?.revenue.orderCount || 0} />
        </div>
      </section>

      {/* Conversion */}
      <section className="mb-8">
        <h2 className="text-[13px] font-medium tracking-[0.08em] mb-4" style={{ color: "rgba(200,190,170,0.45)", margin: 0 }}>转化漏斗</h2>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <Card label="免费→Pro" value={((data?.conversion.freeToProRate || 0) * 100).toFixed(1) + "%"} />
          <Card label="Pro→VIP" value={((data?.conversion.proToVipRate || 0) * 100).toFixed(1) + "%"} />
          <Card label="平均转化天数" value={data?.conversion.avgDaysToConvert || 0} sub="天" />
          <Card label="最佳触发情绪" value={data?.conversion.topTriggerEmotion || "nostalgic"} />
          <Card label="最佳付费时段" value={data?.conversion.bestTimeOfDay + ":00" || ""} sub="晚间" />
        </div>
      </section>

      {/* User Progress */}
      <section className="mb-8">
        <h2 className="text-[13px] font-medium tracking-[0.08em] mb-4" style={{ color: "rgba(200,190,170,0.45)", margin: 0 }}>用户成长</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Card label="总用户" value={data?.progress.totalUsers || 0} />
          <Card label="平均等级" value={"Lv." + (data?.progress.avgLevel || 1)} />
          <Card label="平均依赖分" value={data?.stickiness.avgScore || 0} />
          <Card label="上瘾循环" value={data?.loop.avgLoopsToAddiction || 0} sub="平均循环次数" />
        </div>
      </section>

      {/* Level Distribution */}
      <section className="mb-8">
        <h2 className="text-[13px] font-medium tracking-[0.08em] mb-4" style={{ color: "rgba(200,190,170,0.45)", margin: 0 }}>等级分布</h2>
        <div className="space-y-2">
          {Object.entries(data?.progress.levelDistribution || {}).map(([bucket, count]) => (
            <div key={bucket} className="flex items-center gap-4 rounded-lg p-3"
              style={{ background: "rgba(255,255,255,0.02)", border: "0.5px solid rgba(255,255,255,0.04)" }}>
              <span style={{ color: "rgba(225,220,200,0.6)", fontSize: 12, minWidth: 60 }}>{bucket}</span>
              <div className="flex-1 h-1 rounded-full" style={{ background: "rgba(255,255,255,0.06)" }}>
                <div className="h-1 rounded-full" style={{
                  width: Math.min(100, (count / Math.max(1, data?.progress.totalUsers || 1)) * 100) + "%",
                  background: "linear-gradient(90deg, rgba(160,140,200,0.6), rgba(200,160,120,0.6))",
                }} />
              </div>
              <span style={{ color: "rgba(180,170,150,0.3)", fontSize: 11 }}>{count}人</span>
            </div>
          ))}
        </div>
      </section>

      {/* Stickiness */}
      <section>
        <h2 className="text-[13px] font-medium tracking-[0.08em] mb-4" style={{ color: "rgba(200,190,170,0.45)", margin: 0 }}>依赖度分布</h2>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <Card label="新用户" value={data?.stickiness.byLevel?.new || 0} />
          <Card label="好奇" value={data?.stickiness.byLevel?.curious || 0} />
          <Card label="习惯" value={data?.stickiness.byLevel?.regular || 0} />
          <Card label="依附" value={data?.stickiness.byLevel?.attached || 0} sub="付费黄金期" color="rgba(200,180,100,0.9)" />
          <Card label="上瘾" value={data?.stickiness.byLevel?.dependent || 0} sub="高LTV" color="rgba(140,200,120,0.9)" />
        </div>
      </section>
    </main>
  );
}
