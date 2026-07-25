"use client";

import { useEffect } from "react";

/* ============================================================
   忆见 MemoryAI — MemorySoulBody
   记忆灵魂体 — 从模糊轮廓到亲人形象的生成动画
   3 状态：collecting / forming / ready
   纯 CSS + SVG，无 Three.js
   ============================================================ */

export type SoulState = "collecting" | "forming" | "ready";

interface Props {
  state: SoulState;
  progress?: number;       // 0-100
  avatarUrl?: string;      // ready 状态下显示的占位头像
  name?: string;           // 亲人名称
  onStateComplete?: () => void; // forming 完成回调
}

/* ── 人形 SVG 剪影 ── */
const SILHOUETTE = (
  <svg viewBox="0 0 200 400" style={{ width: "100%", height: "100%" }}>
    <defs>
      <radialGradient id="soulGrad" cx="50%" cy="35%" r="55%">
        <stop offset="0%" stopColor="#ffffff" />
        <stop offset="40%" stopColor="#e0e6ff" />
        <stop offset="100%" stopColor="#b0c0e0" />
      </radialGradient>
      <filter id="soulBlur">
        <feGaussianBlur stdDeviation="2" />
      </filter>
    </defs>
    <g filter="url(#soulBlur)">
      <circle cx="100" cy="48" r="24" fill="url(#soulGrad)" />
      <rect x="88" y="72" width="24" height="18" rx="4" fill="url(#soulGrad)" />
      <path d="M100 90l-32 14a85 85 0 00-12 10l-14 276 24 0 4-160 4-16h32l4 16 4 160 24 0-14-276a85 85 0 00-12-10z" fill="url(#soulGrad)" />
    </g>
  </svg>
);

/* ── 飘浮光点粒子 ── */
function FloatingParticles({ count = 12, active = false }) {
  const particles = Array.from({ length: count }, (_, i) => ({
    id: i,
    left: 30 + Math.random() * 40,
    top: 20 + Math.random() * 60,
    delay: Math.random() * 4,
    duration: 2 + Math.random() * 3,
    size: 2 + Math.random() * 3,
  }));

  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden" }}>
      {particles.map((p) => (
        <div
          key={p.id}
          style={{
            position: "absolute",
            left: `${p.left}%`,
            top: `${p.top}%`,
            width: p.size,
            height: p.size,
            borderRadius: "50%",
            background: "radial-gradient(circle, rgba(255,210,166,0.7), transparent)",
            opacity: active ? 0 : 0,
            animation: active
              ? `particleFloat ${p.duration}s ease-in-out ${p.delay}s infinite, particleFade ${p.duration * 1.3}s ease-in-out ${p.delay}s infinite`
              : "none",
            filter: "blur(1px)",
          }}
        />
      ))}
    </div>
  );
}

/* ── 面部区域微光 ── */
function FaceGlow({ visible = false }) {
  return (
    <div
      style={{
        position: "absolute",
        top: "8%",
        left: "50%",
        transform: "translateX(-50%)",
        width: "28%",
        height: "12%",
        borderRadius: "45%",
        background: "radial-gradient(ellipse, rgba(255,230,200,0.25) 0%, rgba(255,200,150,0.1) 50%, transparent 80%)",
        opacity: visible ? 1 : 0,
        transition: "opacity 1.5s ease",
        animation: visible ? "facePulse 4s ease-in-out infinite" : "none",
      }}
    />
  );
}

export default function MemorySoulBody({
  state,
  progress = 0,
  avatarUrl,
  name,
  onStateComplete,
}: Props) {
  // forming 自动完成
  useEffect(() => {
    if (state === "forming" && progress >= 95) {
      const t = setTimeout(() => onStateComplete?.(), 800);
      return () => clearTimeout(t);
    }
  }, [state, progress, onStateComplete]);

  const isCollecting = state === "collecting";
  const isForming = state === "forming";
  const isReady = state === "ready";
  const isActive = isCollecting || isForming;

  return (
    <div
      style={{
        position: "relative", width: 180, minWidth: 180, height: 260,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      {/* ═══ 全局 CSS ═══ */}
      <style>{`
        @keyframes soulCollectingPulse {
          0%, 100% { opacity: 0.35; filter: drop-shadow(0 0 40px rgba(200,210,255,0.3)) blur(2px); }
          50% { opacity: 0.9; filter: drop-shadow(0 0 70px rgba(220,230,255,0.5)) blur(0.5px); }
        }
        @keyframes soulForming {
          0% { opacity: 0.4; filter: blur(4px) drop-shadow(0 0 30px rgba(180,200,255,0.2)); }
          100% { opacity: 0.85; filter: blur(1px) drop-shadow(0 0 60px rgba(220,240,255,0.4)); }
        }
        @keyframes facePulse {
          0%, 100% { opacity: 0.5; transform: translateX(-50%) scale(0.95); }
          50% { opacity: 1; transform: translateX(-50%) scale(1.08); }
        }
        @keyframes particleFloat {
          0%, 100% { transform: translateY(0) translateX(0); }
          25% { transform: translateY(-12px) translateX(6px); }
          50% { transform: translateY(-22px) translateX(-4px); }
          75% { transform: translateY(-8px) translateX(-8px); }
        }
        @keyframes particleFade {
          0%, 100% { opacity: 0; }
          40% { opacity: 0.7; }
          60% { opacity: 0.9; }
        }
        @keyframes readyGlow {
          0%, 100% { box-shadow: 0 0 40px rgba(255,210,166,0.15), 0 0 80px rgba(255,180,100,0.06); }
          50% { box-shadow: 0 0 60px rgba(255,210,166,0.3), 0 0 120px rgba(255,180,100,0.15); }
        }
        @keyframes progressGlow {
          0% { width: 0%; }
        }
      `}</style>

      {/* ═══ 灵魂体主体 ═══ */}
      <div style={{
        position: "relative",
        width: 160,
        height: 240,
      }}>
        {/* 人形剪影 */}
        <div
          style={{
            width: "100%",
            height: "100%",
            animation: state === "collecting"
              ? "soulCollectingPulse 2.5s ease-in-out infinite"
              : state === "forming"
              ? "soulForming 2s ease-in-out forwards"
              : "none",
            opacity: isReady ? 0.9 : undefined,
            transition: isReady ? "opacity 0.8s ease" : undefined,
            display: isReady && avatarUrl ? "none" : "block",
          }}
        >
          {SILHOUETTE}
        </div>

        {/* ready 状态：头像 */}
        {isReady && (
          <div style={{
            position: "absolute", inset: 0,
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            <div style={{
              width: "55%",
              aspectRatio: "1",
              borderRadius: "50%",
              background: avatarUrl
                ? `url(${avatarUrl}) center/cover`
                : "radial-gradient(circle at 35% 35%, rgba(255,210,166,0.2), rgba(20,15,25,0.8))",
              boxShadow: "0 0 40px rgba(255,210,166,0.15), 0 0 80px rgba(255,180,100,0.06)",
              animation: "readyGlow 4s ease-in-out infinite",
              display: "flex", alignItems: "center", justifyContent: "center",
            }}>
              {!avatarUrl && (
                <svg width="40%" height="40%" viewBox="0 0 60 80" style={{ opacity: 0.45 }}>
                  <ellipse cx="30" cy="18" rx="14" ry="16" fill="rgba(255,210,166,0.5)" />
                  <path d="M16 34 Q16 30 30 30 Q44 30 44 34 L46 68 L38 68 L36 48 L24 48 L22 68 L14 68 Z" fill="rgba(255,210,166,0.45)" />
                </svg>
              )}
            </div>
          </div>
        )}

        {/* 面部微光（forming 状态） */}
        <FaceGlow visible={isForming} />

        {/* 飘浮粒子（collecting & forming 状态） */}
        <FloatingParticles count={14} active={isCollecting} />
        <FloatingParticles count={8} active={isForming} />
      </div>

      {/* ═══ 进度条（collecting / forming） ═══ */}
      {isActive && (
        <div style={{
          marginTop: 32,
          width: "50vw",
          maxWidth: 200,
          height: 1.5,
          borderRadius: 1,
          background: "rgba(255,210,166,0.08)",
          overflow: "hidden",
        }}>
          <div style={{
            height: "100%",
            width: `${Math.min(progress, 100)}%`,
            borderRadius: 1,
            background: "linear-gradient(90deg, rgba(255,210,166,0.2), rgba(255,180,100,0.5), rgba(255,210,166,0.3))",
            transition: "width 0.8s ease",
          }} />
        </div>
      )}

      {/* ═══ 文案 ═══ */}
      <p style={{
        marginTop: 24,
        fontSize: 14,
        fontWeight: 300,
        letterSpacing: "0.06em",
        color: state === "ready" ? "#FFD2A6" : "rgba(255,210,166,0.5)",
        textAlign: "center",
        transition: "color 1s ease",
      }}>
        {state === "collecting" && "记忆正在靠近"}
        {state === "forming" && "Ta的轮廓正在浮现"}
        {state === "ready" && (
          name ? `可以遇见${name}了` : "可以遇见Ta了"
        )}
      </p>
    </div>
  );
}



