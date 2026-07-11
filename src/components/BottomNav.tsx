"use client";

import React from "react";
import { usePathname, useRouter } from "next/navigation";
import { motion } from "framer-motion";

// Simple localStorage emotion reader — zero module imports beyond React/Next/framer
function readEmotionGlow(): string {
  if (typeof window === "undefined") return "rgba(130,180,230,";
  try {
    const raw = localStorage.getItem("yj_emo_state");
    if (raw) {
      const state = JSON.parse(raw);
      const map: Record<string, string> = {
        warm: "rgba(255,170,80,",
        calm: "rgba(130,180,230,",
        sad: "rgba(140,150,170,",
        nostalgic: "rgba(210,160,100,",
      };
      return map[state.type] || map.calm;
    }
  } catch {}
  return "rgba(130,180,230,";
}

const TABS = [
  {
    key: "home", label: "首页", path: "/",
    icon: (active: boolean) => (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none"
        stroke={active ? "rgba(220,200,240,0.9)" : "rgba(160,150,170,0.4)"}
        strokeWidth={active ? 1.8 : 1.3} strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z" />
        <polyline points="9 22 9 12 15 12 15 22" />
      </svg>
    ),
  },
  {
    key: "chat", label: "聊天", path: "/dialogue",
    icon: (active: boolean) => (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none"
        stroke={active ? "rgba(220,200,240,0.9)" : "rgba(160,150,170,0.4)"}
        strokeWidth={active ? 1.8 : 1.3} strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />
      </svg>
    ),
  },
  {
    key: "room", label: "记忆", path: "/memory-world",
    icon: (active: boolean) => (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none"
        stroke={active ? "rgba(220,200,240,0.9)" : "rgba(160,150,170,0.4)"}
        strokeWidth={active ? 1.8 : 1.3} strokeLinecap="round" strokeLinejoin="round">
        <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
      </svg>
    ),
  },
  {
    key: "profile", label: "我的", path: "/continuity",
    icon: (active: boolean) => (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none"
        stroke={active ? "rgba(220,200,240,0.9)" : "rgba(160,150,170,0.4)"}
        strokeWidth={active ? 1.8 : 1.3} strokeLinecap="round" strokeLinejoin="round">
        <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2" />
        <circle cx="12" cy="7" r="4" />
      </svg>
    ),
  },
];

export default function BottomNav() {
  const [glowColor, setGlowColor] = React.useState("rgba(130,180,230,");
  React.useEffect(() => { setGlowColor(readEmotionGlow()); }, []);

  const pathname = usePathname();
  const router = useRouter();

  function isActive(tab: typeof TABS[number]): boolean {
    if (tab.path === "/") return pathname === "/";
    return pathname.startsWith(tab.path);
  }

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-50 flex items-center justify-around"
      style={{
        height: "calc(64px + env(safe-area-inset-bottom, 0px))",
        paddingBottom: "env(safe-area-inset-bottom, 0px)",
        background: "rgba(12,10,20,0.88)",
        backdropFilter: "blur(24px) saturate(180%)",
        WebkitBackdropFilter: "blur(24px) saturate(180%)",
        borderTop: "0.5px solid rgba(255,255,255,0.05)",
        boxShadow: "0 -4px 30px rgba(0,0,0,0.3)",
      }}
    >
      {TABS.map((tab) => {
        const active = isActive(tab);
        return (
          <motion.button
            key={tab.key}
            onClick={() => router.push(tab.path)}
            whileTap={{ scale: 0.92 }}
            className="flex flex-col items-center justify-center gap-0.5 select-none relative"
            style={{
              background: "none", border: "none", cursor: "pointer",
              padding: "6px 12px", minWidth: 56, outline: "none",
            }}
          >
            {active && (
              <motion.div
                layoutId="tab-glow"
                className="absolute rounded-full pointer-events-none"
                style={{
                  width: 44, height: 32,
                  background: "radial-gradient(ellipse at 50% 50%, " + glowColor + "0.22) 0%, transparent 75%)",
                  filter: "blur(6px)", marginBottom: 18,
                }}
                transition={{ type: "spring", stiffness: 500, damping: 30 }}
              />
            )}
            <div className="relative z-10">{tab.icon(active)}</div>
            <span
              className="text-[10px] tracking-[0.05em] transition-colors duration-300"
              style={{
                color: active ? "rgba(210,195,230,0.75)" : "rgba(160,150,170,0.3)",
                fontWeight: active ? 600 : 400,
              }}
            >
              {tab.label}
            </span>
          </motion.button>
        );
      })}
    </nav>
  );
}
