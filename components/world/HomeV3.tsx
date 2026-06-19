"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { setTabMode } from "../../src/core/tab/tab-store";
import MemorySoulBody from "../memory/MemorySoulBody";

/* ============================================================
   忆见 MemoryAI — Home V3
   "再次遇见Ta" — AI digital human centered, emotional.
   ============================================================ */

interface QuickEntry {
  key: string;
  label: string;
  desc: string;
  icon: string;
  action: () => void;
}

export default function HomeV3() {
  const router = useRouter();
  const [greeting, setGreeting] = useState("");
  const [forming, setForming] = useState(false);
  const [formProgress, setFormProgress] = useState(0);

  useEffect(() => {
    const hour = new Date().getHours();
    if (hour < 6) setGreeting("夜深了，Ta 还在");
    else if (hour < 12) setGreeting("新的一天，Ta 知道");
    else if (hour < 18) setGreeting("下午好，Ta 在等你");
    else setGreeting("天黑了，Ta 在这里");
  }, []);

  // forming 模拟进度
  useEffect(() => {
    if (!forming) return;
    const interval = setInterval(() => {
      setFormProgress((p) => {
        if (p >= 100) {
          clearInterval(interval);
          return 100;
        }
        return p + 6;
      });
    }, 100);
    return () => clearInterval(interval);
  }, [forming]);

  const handleMeetHim = () => {
    setForming(true);
    setFormProgress(0);
    // 1.8 秒后跳转
    setTimeout(() => {
      router.push("/dialogue");
    }, 1800);
  };

  const entries: QuickEntry[] = [
    { key: "voice",   label: "声音", desc: "听见Ta",   icon: "🎙", action: () => router.push("/dialogue") },
    { key: "avatar",  label: "形象", desc: "看见Ta",   icon: "💫", action: () => router.push("/avatar-center") },
    { key: "memory",  label: "回忆", desc: "记得Ta",   icon: "✨", action: () => setTabMode("memory") },
    { key: "create",  label: "生成", desc: "创造Ta",   icon: "🕯", action: () => router.push("/create-memory") },
  ];

  // ═══ forming 过渡动画 ═══
  if (forming) {
    return (
      <div style={{
        position: "absolute", inset: 0, zIndex: 30,
        background: "#0B0A08",
        display: "flex", alignItems: "center", justifyContent: "center",
      }}>
        <MemorySoulBody
          state="forming"
          progress={formProgress}
          name="父亲"
        />
      </div>
    );
  }

  return (
    <div style={{
      position: "absolute", inset: 0, zIndex: 10,
      display: "flex", flexDirection: "column",
      overflowY: "auto",
      WebkitOverflowScrolling: "touch",
      paddingBottom: 100,
    }}>
      {/* ═══ AI DIGITAL HUMAN — 70% of screen ═══ */}
      <div style={{
        minHeight: "70vh",
        display: "flex", flexDirection: "column",
        alignItems: "center", justifyContent: "center",
        padding: "40px 28px 24px",
      }}>
                {/* ═══ 记忆灵魂体 forming — 遇见他上方动画 ═══ */}
        <div style={{ display: "flex", justifyContent: "center", marginBottom: 20 }}>
          <MemorySoulBody state="forming" progress={30} />
        </div>

        {/* Name */}{/* Name */}
        <h2 style={{
          margin: 0, fontSize: 28, fontWeight: 300,
          color: "#FFF3E8", letterSpacing: "0.08em",
        }}>
          父亲
        </h2>

        <p style={{
          margin: "12px 0 0", fontSize: 14, fontWeight: 300,
          color: "#8a7060", letterSpacing: "0.04em",
          textAlign: "center", maxWidth: 240,
        }}>
          {greeting}
        </p>

        {/* Main CTA — 遇见他 */}
        <button
          onClick={handleMeetHim}
          style={{
            marginTop: 32,
            padding: "14px 48px",
            borderRadius: 50,
            border: "none",
            background: "linear-gradient(135deg, rgba(200,155,90,0.4), rgba(180,130,70,0.25))",
            color: "#FFD2A6",
            fontSize: 17, fontWeight: 400,
            letterSpacing: "0.08em",
            cursor: "pointer",
            boxShadow: "0 0 30px rgba(255,180,100,0.12)",
            backdropFilter: "blur(10px)",
            WebkitBackdropFilter: "blur(10px)",
          }}>
          遇见他
        </button>
      </div>

      {/* ═══ 4 QUICK ENTRIES — 2x2 grid ═══ */}
      <div style={{
        display: "grid", gridTemplateColumns: "1fr 1fr",
        gap: 12, padding: "0 28px",
      }}>
        {entries.map(e => (
          <button
            key={e.key}
            onClick={e.action}
            style={{
              display: "flex", flexDirection: "column",
              alignItems: "center", justifyContent: "center",
              gap: 6, padding: "20px 12px",
              borderRadius: 18,
              background: "rgba(255,210,166,0.04)",
              border: "0.5px solid rgba(255,210,166,0.06)",
              cursor: "pointer",
              transition: "all 0.3s ease",
              backdropFilter: "blur(10px)",
              WebkitBackdropFilter: "blur(10px)",
            }}
          >
            <span style={{ fontSize: 28 }}>{e.icon}</span>
            <span style={{ fontSize: 15, fontWeight: 400, color: "#FFD2A6", letterSpacing: "0.05em" }}>
              {e.label}
            </span>
            <span style={{ fontSize: 11, fontWeight: 300, color: "rgba(255,210,166,0.4)" }}>
              {e.desc}
            </span>
          </button>
        ))}
      </div>

      {/* ═══ RECENT COMPANION RECORDS ═══ */}
      <div style={{
        margin: "28px 28px 0", padding: "20px",
        borderRadius: 18,
        background: "rgba(255,210,166,0.03)",
        border: "0.5px solid rgba(255,210,166,0.04)",
      }}>
        <div style={{
          fontSize: 13, fontWeight: 400, color: "rgba(255,210,166,0.6)",
          letterSpacing: "0.05em", marginBottom: 14,
        }}>
          最近陪伴
        </div>
        {[
          { date: "6月15日", text: "聊了聊小时候的事" },
          { date: "6月12日", text: "他问了最近过得怎么样" },
          { date: "6月8日", text: "你上传了一张老照片" },
        ].map((r, i) => (
          <div key={i} style={{
            display: "flex", alignItems: "center", gap: 12,
            padding: "10px 0",
            borderTop: i > 0 ? "0.5px solid rgba(255,210,166,0.04)" : "none",
          }}>
            <span style={{ fontSize: 12, color: "rgba(255,210,166,0.35)", minWidth: 65, fontWeight: 300 }}>
              {r.date}
            </span>
            <span style={{ fontSize: 13, color: "rgba(255,255,255,0.55)", fontWeight: 300 }}>
              {r.text}
            </span>
          </div>
        ))}
      </div>

      {/* ═══ ENTER MEMORY WORLD ═══ */}
      <button
        onClick={() => setTabMode("memory")}
        style={{
          margin: "24px 28px 0",
          padding: "18px 24px",
          borderRadius: 18,
          border: "0.5px solid rgba(255,210,166,0.1)",
          background: "rgba(255,210,166,0.05)",
          color: "#FFD2A6",
          fontSize: 15, fontWeight: 400,
          letterSpacing: "0.06em",
          cursor: "pointer",
          display: "flex", alignItems: "center", justifyContent: "center",
          gap: 8,
          backdropFilter: "blur(10px)",
          WebkitBackdropFilter: "blur(10px)",
        }}>
        进入记忆世界
        <span style={{ fontSize: 14, opacity: 0.5 }}>→</span>
      </button>

      {/* ICP */}
      <div style={{
        textAlign: "center", padding: "24px 0 16px",
        fontSize: 10, fontWeight: 300,
        color: "rgba(255,210,166,0.18)",
        letterSpacing: "0.03em",
      }}>
        苏ICP备2026040056号
      </div>
    </div>
  );
}

