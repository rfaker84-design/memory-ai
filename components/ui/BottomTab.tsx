"use client";

import { type TabMode, setTabMode } from "../../src/core/tab/tab-store";

/* ============================================================
   忆见 MemoryAI — Bottom Tab Bar
   Glassmorphism · Fixed bottom · State-only navigation
   ============================================================ */

interface TabDef {
  key: TabMode;
  label: string;
  icon: string;
}

const TABS: TabDef[] = [
  { key: "home",    label: "忆", icon: "◉" },
  { key: "chat",    label: "言", icon: "◇" },
  { key: "memory",  label: "记", icon: "○" },
  { key: "profile", label: "我", icon: "♢" },
];

interface BottomTabProps {
  active: TabMode;
}

export default function BottomTab({ active }: BottomTabProps) {
  return (
    <div style={{
      position: "fixed", bottom: 0, left: 0, right: 0, zIndex: 20,
      display: "flex", justifyContent: "center", gap: 12,
      padding: "14px 20px 28px",
      background: "rgba(11,10,8,0.82)",
      backdropFilter: "blur(20px)",
      WebkitBackdropFilter: "blur(20px)",
      borderTop: "0.5px solid rgba(255,210,166,0.06)",
    }}>
      {TABS.map(tab => {
        const isActive = active === tab.key;
        return (
          <button
            key={tab.key}
            onClick={() => setTabMode(tab.key)}
            style={{
              flex: 1, maxWidth: 80,
              display: "flex", flexDirection: "column",
              alignItems: "center", gap: 4,
              padding: "8px 0",
              background: "none",
              border: "none",
              cursor: "pointer",
              opacity: isActive ? 1 : 0.35,
              transition: "opacity 0.35s ease",
            }}
          >
            <span style={{
              fontSize: 18,
              color: isActive ? "#FFD2A6" : "rgba(255,255,255,0.5)",
              transition: "color 0.35s ease",
            }}>
              {tab.icon}
            </span>
            <span style={{
              fontSize: 11,
              fontWeight: isActive ? 400 : 300,
              color: isActive ? "#FFD2A6" : "rgba(255,255,255,0.4)",
              letterSpacing: "0.06em",
              transition: "color 0.35s ease",
            }}>
              {tab.label}
            </span>
            {isActive && (
              <div style={{
                width: 3, height: 3, borderRadius: "50%",
                background: "#FFD2A6",
                marginTop: 2,
              }} />
            )}
          </button>
        );
      })}
    </div>
  );
}