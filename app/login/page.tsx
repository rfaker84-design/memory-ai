"use client";

import { useRouter } from "next/navigation";
import MemorySoulBody from "../../components/memory/MemorySoulBody";

/* ============================================================
   忆见 MemoryAI — 登录页
   记忆灵魂体 empty 状态 → 强制可见
   ============================================================ */

export default function LoginPage() {
  const router = useRouter();

  return (
    <div style={{
      position: "fixed", inset: 0,
      background: "#0B0A08",
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      gap: 32,
    }}>
      {/* ═══ 记忆灵魂体 empty ═══ */}
      <MemorySoulBody state="empty" />

      {/* ═══ 进入按钮 ═══ */}
      <button
        onClick={() => router.push("/")}
        style={{
          padding: "12px 40px",
          borderRadius: 50,
          border: "0.5px solid rgba(255,210,166,0.15)",
          background: "rgba(255,210,166,0.06)",
          color: "#FFD2A6",
          fontSize: 15, fontWeight: 300,
          letterSpacing: "0.08em",
          cursor: "pointer",
          backdropFilter: "blur(10px)",
        }}
      >
        进入
      </button>

      {/* ICP */}
      <div style={{
        position: "fixed", bottom: 40,
        fontSize: 10, fontWeight: 300,
        color: "rgba(255,210,166,0.15)",
        letterSpacing: "0.03em",
      }}>
        苏ICP备2026040056号
      </div>
    </div>
  );
}
