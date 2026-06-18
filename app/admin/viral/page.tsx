"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";

interface ViralData {
  viral: {
    totalShares: number;
    shareRate: string;
    viralCoefficient: string;
    sharesByChannel: Record<string, number>;
    conversionByVariant: Record<string, number>;
  };
  loop: {
    steps: string[];
    conversionRate: number[];
    cycleTimeDays: number;
  };
  kols: Array<{ handle: string; platform: string; referrals: number; partnership: string }>;
}

export default function ViralPage() {
  const router = useRouter();
  const [data, setData] = useState<ViralData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem("yijian_session");
    if (!token) { router.push("/login"); return; }
    fetch("/api/viral/stats", { headers: { Authorization: "Bearer " + token } })
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

  const channelNames: Record<string, string> = { wechat: "微信", weibo: "微博", douyin: "抖音", xiaohongshu: "小红书", copy_link: "复制链接", save_image: "保存图片" };

  return (
    <main className="min-h-screen p-6 md:p-8" style={{ background: "#0b0b0f" }}>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-[20px] font-light tracking-[0.08em]" style={{ color: "rgba(225,220,200,0.8)", margin: 0 }}>病毒传播</h1>
          <p className="text-[11px] tracking-[0.1em] mt-1" style={{ color: "rgba(180,170,150,0.25)", margin: 0 }}>V7 Viral Analytics</p>
        </div>
        <button onClick={() => router.push("/admin")} className="text-[11px] px-4 py-2 rounded-lg"
          style={{ color: "rgba(180,160,130,0.4)", background: "rgba(255,255,255,0.03)", border: "0.5px solid rgba(255,255,255,0.06)", cursor: "pointer" }}>← 返回</button>
      </div>

      {/* Key Metrics */}
      <section className="mb-8">
        <h2 className="text-[13px] font-medium tracking-[0.08em] mb-4" style={{ color: "rgba(200,190,170,0.45)", margin: 0 }}>核心指标</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Card label="总分享" value={data?.viral.totalShares || 0} />
          <Card label="分享率" value={data?.viral.shareRate || "0%"} />
          <Card label="K因子" value={data?.viral.viralCoefficient || "0"} sub=">1 即病毒传播" color={parseFloat(data?.viral.viralCoefficient || "0") >= 1 ? "rgba(100,220,130,0.9)" : undefined} />
          <Card label="病毒周期" value={data?.loop.cycleTimeDays + "天" || "0"} />
        </div>
      </section>

      {/* Channels */}
      <section className="mb-8">
        <h2 className="text-[13px] font-medium tracking-[0.08em] mb-4" style={{ color: "rgba(200,190,170,0.45)", margin: 0 }}>分享渠道</h2>
        <div className="space-y-2">
          {Object.entries(data?.viral.sharesByChannel || {}).map(([ch, count]) => (
            <div key={ch} className="flex items-center gap-4 rounded-lg p-3"
              style={{ background: "rgba(255,255,255,0.02)", border: "0.5px solid rgba(255,255,255,0.04)" }}>
              <span style={{ color: "rgba(225,220,200,0.7)", fontSize: 13, minWidth: 70 }}>{channelNames[ch] || ch}</span>
              <div className="flex-1 h-1 rounded-full" style={{ background: "rgba(255,255,255,0.06)" }}>
                <div className="h-1 rounded-full" style={{
                  width: Math.min(100, (count / Math.max(1, data?.viral.totalShares || 1)) * 100) + "%",
                  background: "rgba(180,160,130,0.6)",
                }} />
              </div>
              <span style={{ color: "rgba(180,170,150,0.35)", fontSize: 11 }}>{count}次</span>
            </div>
          ))}
        </div>
      </section>

      {/* A/B Tests */}
      <section className="mb-8">
        <h2 className="text-[13px] font-medium tracking-[0.08em] mb-4" style={{ color: "rgba(200,190,170,0.45)", margin: 0 }}>A/B 测试</h2>
        <div className="grid grid-cols-3 gap-3">
          {Object.entries(data?.viral.conversionByVariant || {}).map(([v, count]) => (
            <Card key={v} label={"变体 " + v} value={count} sub="次转化" />
          ))}
        </div>
      </section>

      {/* KOL Leaderboard */}
      <section>
        <h2 className="text-[13px] font-medium tracking-[0.08em] mb-4" style={{ color: "rgba(200,190,170,0.45)", margin: 0 }}>KOL 排行榜</h2>
        <div className="space-y-2">
          {(data?.kols || []).slice(0, 5).map((k, i) => (
            <div key={k.handle} className="flex items-center gap-3 rounded-lg p-3"
              style={{ background: i === 0 ? "rgba(180,160,130,0.06)" : "rgba(255,255,255,0.02)", border: "0.5px solid rgba(255,255,255,0.04)" }}>
              <span style={{ color: i === 0 ? "rgba(220,200,140,0.7)" : "rgba(180,170,150,0.4)", fontSize: 14 }}>#{i + 1}</span>
              <span style={{ color: "rgba(225,220,200,0.6)", fontSize: 12 }}>{k.handle}</span>
              <span style={{ color: "rgba(180,170,150,0.3)", fontSize: 10, marginLeft: "auto" }}>
                {k.partnership} · {k.platform}
              </span>
              <span style={{ color: "rgba(180,170,150,0.4)", fontSize: 12 }}>{k.referrals}人</span>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
