"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";

// ═══════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════
interface DashboardData {
  health: {
    loadLevel: string;
    activeRequests: number;
    maxConcurrent: number;
    cpuUsage: number;
    rejectRate: number;
    degradedServices: string[];
    uptime: number;
  };
  circuits: Record<string, { state: string; failureRate: number; totalCalls: number }>;
  system: { totalCalls: number; todayCost: number; totalCost: number };
  queue: { queued: number; processing: number };
  logs: { total: number; errors: number; avgDuration: number };
  cache: {
    llm: { hitRate: number; size: number };
    tts: { hitRate: number; size: number };
  };
}

// ═══════════════════════════════════════════════════════════════
// Component
// ═══════════════════════════════════════════════════════════════
export default function DashboardPage() {
  const router = useRouter();
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    const token = localStorage.getItem("yijian_session");
    if (!token) { router.push("/login"); return; }

    try {
      const [adminRes, healthRes] = await Promise.all([
        fetch("/api/admin/stats", { headers: { Authorization: "Bearer " + token } }),
        fetch("/api/admin/health", { headers: { Authorization: "Bearer " + token } }),
      ]);

      const admin = await adminRes.json();
      const health = await healthRes.json();

      setData({
        health: health.health || {
          loadLevel: "normal", activeRequests: 0, maxConcurrent: 200,
          cpuUsage: 0, rejectRate: 0, degradedServices: [], uptime: 0,
        },
        circuits: health.circuits || {},
        system: {
          totalCalls: admin.system?.totalCalls || 0,
          todayCost: parseFloat(admin.system?.todayCostYuan || "0"),
          totalCost: parseFloat(admin.system?.totalCostYuan || "0"),
        },
        queue: admin.queue || { queued: 0, processing: 0 },
        logs: {
          total: 0, errors: 0, avgDuration: 0,
        },
        cache: {
          llm: admin.cache?.llm || { hitRate: 0, size: 0 },
          tts: admin.cache?.tts || { hitRate: 0, size: 0 },
        },
      });
    } catch {
      /* ignore */
    }
    setLoading(false);
  }, [router]);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 5000);
    return () => clearInterval(interval);
  }, [fetchData]);

  if (loading) {
    return (
      <main className="fixed inset-0 flex items-center justify-center" style={{ background: "#0b0b0f" }}>
        <motion.div animate={{ opacity: [0.1, 0.4, 0.1] }} transition={{ duration: 2, repeat: Infinity }}
          className="w-3 h-3 rounded-full" style={{ background: "rgba(180,160,130,0.3)" }} />
      </main>
    );
  }

  const MetricCard = ({ label, value, color, sub }: { label: string; value: string | number; color?: string; sub?: string }) => (
    <div className="rounded-xl p-4" style={{ background: "rgba(255,255,255,0.025)", border: "0.5px solid rgba(255,255,255,0.05)" }}>
      <p style={{ color: "rgba(180,170,150,0.35)", fontSize: 11, letterSpacing: "0.05em", margin: 0 }}>{label}</p>
      <p style={{ color: color || "rgba(225,220,200,0.85)", fontSize: 24, fontWeight: 300, margin: "4px 0 0 0" }}>{value}</p>
      {sub && <p style={{ color: "rgba(180,170,150,0.25)", fontSize: 10, margin: "2px 0 0 0" }}>{sub}</p>}
    </div>
  );

  const loadColor = (() => {
    switch (data?.health.loadLevel) {
      case "critical": return "rgba(255,100,80,0.9)";
      case "high": return "rgba(255,180,60,0.9)";
      case "elevated": return "rgba(200,180,100,0.9)";
      default: return "rgba(100,200,130,0.9)";
    }
  })();

  return (
    <main className="min-h-screen p-6 md:p-8" style={{ background: "#0b0b0f" }}>
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-[20px] font-light tracking-[0.08em]" style={{ color: "rgba(225,220,200,0.8)", margin: 0 }}>
            系统监控面板
          </h1>
          <p className="text-[11px] tracking-[0.1em] mt-1" style={{ color: "rgba(180,170,150,0.25)", margin: 0 }}>
            V5 Production Dashboard · 5s auto-refresh
          </p>
        </div>
        <div className="flex gap-3">
          <button onClick={fetchData} className="text-[11px] px-4 py-2 rounded-lg"
            style={{ color: "rgba(180,160,130,0.5)", background: "rgba(255,255,255,0.03)", border: "0.5px solid rgba(255,255,255,0.06)", cursor: "pointer" }}>
            ⟳ 刷新
          </button>
          <button onClick={() => router.push("/admin")} className="text-[11px] px-4 py-2 rounded-lg"
            style={{ color: "rgba(180,160,130,0.4)", background: "rgba(255,255,255,0.03)", border: "0.5px solid rgba(255,255,255,0.06)", cursor: "pointer" }}>
            ← 返回
          </button>
        </div>
      </div>

      {/* System Health */}
      <section className="mb-8">
        <h2 className="text-[13px] font-medium tracking-[0.08em] mb-4" style={{ color: "rgba(200,190,170,0.45)", margin: 0 }}>
          系统健康
        </h2>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <MetricCard label="负载等级" value={data?.health.loadLevel || "normal"} color={loadColor} />
          <MetricCard label="活跃请求" value={data?.health.activeRequests || 0} sub={"最大: " + (data?.health.maxConcurrent || 0)} />
          <MetricCard label="CPU 估算" value={(data?.health.cpuUsage || 0).toFixed(1) + "%"} />
          <MetricCard label="拒绝率" value={(data?.health.rejectRate || 0).toFixed(1) + "%"} />
          <MetricCard label="运行时间" value={formatUptime(data?.health.uptime || 0)} />
        </div>
        {data?.health.degradedServices && data.health.degradedServices.length > 0 && (
          <div className="mt-3 p-3 rounded-lg" style={{ background: "rgba(255,100,80,0.08)", border: "0.5px solid rgba(255,100,80,0.15)" }}>
            <p style={{ color: "rgba(255,160,140,0.7)", fontSize: 12, margin: 0 }}>
              ⚠ 降级服务: {data.health.degradedServices.join(", ")}
            </p>
          </div>
        )}
      </section>

      {/* Circuit Breakers */}
      <section className="mb-8">
        <h2 className="text-[13px] font-medium tracking-[0.08em] mb-4" style={{ color: "rgba(200,190,170,0.45)", margin: 0 }}>
          熔断器状态
        </h2>
        <div className="grid grid-cols-3 gap-3">
          {Object.entries(data?.circuits || {}).map(([name, c]) => (
            <div key={name} className="rounded-xl p-4" style={{
              background: c.state === "open" ? "rgba(255,100,80,0.06)" : "rgba(255,255,255,0.02)",
              border: `0.5px solid ${c.state === "open" ? "rgba(255,100,80,0.15)" : "rgba(255,255,255,0.05)"}`,
            }}>
              <div className="flex items-center gap-2 mb-2">
                <span className="w-2 h-2 rounded-full" style={{
                  background: c.state === "closed" ? "rgba(100,200,130,0.8)" : c.state === "half_open" ? "rgba(255,180,60,0.8)" : "rgba(255,100,80,0.8)",
                }} />
                <span style={{ color: "rgba(225,220,200,0.7)", fontSize: 13, textTransform: "uppercase" }}>{name}</span>
              </div>
              <p style={{ color: "rgba(180,170,150,0.35)", fontSize: 11, margin: 0 }}>
                {c.state} · 失败率 {(c.failureRate * 100).toFixed(0)}% · 调用 {c.totalCalls}次
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* Performance */}
      <section className="mb-8">
        <h2 className="text-[13px] font-medium tracking-[0.08em] mb-4" style={{ color: "rgba(200,190,170,0.45)", margin: 0 }}>
          性能 & 缓存
        </h2>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <MetricCard label="总 API 调用" value={data?.system.totalCalls || 0} />
          <MetricCard label="今日成本" value={"¥" + (data?.system.todayCost || 0).toFixed(2)} />
          <MetricCard label="累计成本" value={"¥" + (data?.system.totalCost || 0).toFixed(2)} />
          <MetricCard label="LLM 缓存命中" value={((data?.cache.llm.hitRate || 0) * 100).toFixed(0) + "%"} sub={"缓存 " + (data?.cache.llm.size || 0) + " 条"} />
          <MetricCard label="TTS 缓存命中" value={((data?.cache.tts.hitRate || 0) * 100).toFixed(0) + "%"} sub={"缓存 " + (data?.cache.tts.size || 0) + " 条"} />
        </div>
      </section>

      {/* Queue */}
      <section>
        <h2 className="text-[13px] font-medium tracking-[0.08em] mb-4" style={{ color: "rgba(200,190,170,0.45)", margin: 0 }}>
          消息队列
        </h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <MetricCard label="排队中" value={data?.queue.queued || 0} />
          <MetricCard label="处理中" value={data?.queue.processing || 0} />
          <MetricCard label="日志总数" value={data?.logs.total || 0} />
          <MetricCard label="错误数" value={data?.logs.errors || 0} color={data?.logs.errors ? "rgba(255,100,80,0.9)" : undefined} />
        </div>
      </section>
    </main>
  );
}

function formatUptime(ms: number): string {
  const mins = Math.floor(ms / 60000);
  if (mins < 60) return mins + "m";
  const hours = Math.floor(mins / 60);
  if (hours < 24) return hours + "h " + (mins % 60) + "m";
  const days = Math.floor(hours / 24);
  return days + "d " + (hours % 24) + "h";
}
