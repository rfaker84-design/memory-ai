"use client";
import { useMemo } from "react";
import type { PersonalityCore, RelationshipState } from "../../app/api/memory-personality/route";

const TONE_LABELS: Record<string, string> = { warm: "温暖", calm: "沉静", nostalgic: "怀念", gentle: "温柔" };
const TONE_HUES: Record<string, number> = { warm: 35, calm: 210, nostalgic: 30, gentle: 180 };

export function getConsistencyPrompt(personality: PersonalityCore, relationship: RelationshipState): string {
  const toneLabel = TONE_LABELS[personality.tone] || "温柔";
  const familiarityDesc = relationship.familiarity > 0.7 ? "非常熟悉" : relationship.familiarity > 0.4 ? "逐渐熟悉" : "还在认识";
  return `你是一个${toneLabel}型人格。你对对话者${familiarityDesc}。亲近度${Math.round(relationship.closeness * 100)}%。表达丰富度${Math.round(personality.expressiveness * 100)}%。请保持此风格。`;
}

export default function PersonalityPresence({
  personality, relationship,
}: {
  personality: PersonalityCore; relationship: RelationshipState;
}) {
  const hue = TONE_HUES[personality.tone] || 180;
  const closenessPct = Math.round(relationship.closeness * 100);
  const familiarityPct = Math.round(relationship.familiarity * 100);

  return (
    <div className="flex items-center gap-4 px-6 py-3" style={{ pointerEvents: "none" }}>
      {/* Avatar glow */}
      <div
        className="relative flex items-center justify-center"
        style={{ width: 36, height: 36 }}
      >
        <div
          style={{
            position: "absolute", inset: -4, borderRadius: "50%",
            background: `radial-gradient(circle, hsla(${hue},50%,65%,${0.2 + personality.expressiveness * 0.2}) 0%, transparent 65%)`,
            filter: "blur(6px)",
          }}
        />
        <div
          style={{
            width: 28, height: 28, borderRadius: "50%",
            background: `radial-gradient(circle at 40% 35%, hsla(${hue},40%,80%,0.9) 0%, hsla(${hue},30%,50%,0.5) 100%)`,
          }}
        />
      </div>

      {/* Info */}
      <div className="flex-1">
        <p style={{ fontSize: 10, color: "rgba(180,170,150,0.3)", letterSpacing: "0.12em", margin: 0 }}>
          {TONE_LABELS[personality.tone]?.toUpperCase() || "GENTLE"} · 交互 {relationship.totalInteractions} 次
        </p>
        <div className="flex gap-3 mt-1">
          <MiniBar label="亲近" value={closenessPct} hue={hue} />
          <MiniBar label="熟悉" value={familiarityPct} hue={hue} />
        </div>
      </div>
    </div>
  );
}

function MiniBar({ label, value, hue }: { label: string; value: number; hue: number }) {
  return (
    <div className="flex items-center gap-1">
      <span style={{ fontSize: 8, color: "rgba(160,150,140,0.2)" }}>{label}</span>
      <div style={{ width: 36, height: 2, borderRadius: 1, background: "rgba(255,255,255,0.05)" }}>
        <div style={{ width: `${value}%`, height: "100%", borderRadius: 1, background: `hsla(${hue},40%,65%,0.5)`, transition: "width 3s" }} />
      </div>
    </div>
  );
}