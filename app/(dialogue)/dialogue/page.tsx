"use client";
import { useState, useEffect, useRef, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { MemoryTheme as T, WarmMotion as M } from "../../../src/lib/design-system/memory-theme";
import { getEmotion, getEmotionMetadata, onEmotionChange } from "../../../lib/emotion/emotion-engine";
import { loadMemory, getRelationshipSummary, type RelationshipTier } from "../../../lib/ai/memory/memory-core";
import type { EmotionState } from "../../../lib/visual-ai-controller";

/* ============================================================
   忆见 MemoryAI — Memory Dialogue
   Entity-bound · Emotion-aware · Warm memory UI
   ============================================================ */

type Memory = { id:string; name:string; relationship:string|null };
type Message = { role:"user"|"assistant"; content:string };

const EMOTION_LABELS: Record<EmotionState, { label: string; color: string }> = {
  calm:    { label: "平静",  color: "#D6BBA6" },
  memory:  { label: "回忆中", color: "#FFD2A6" },
  sad:     { label: "感伤",  color: "#C8966A" },
  happy:   { label: "愉悦",  color: "#FFE4C4" },
  thinking:{ label: "沉思",  color: "#FFF3E8" },
};

function DialogueInner() {
  const router = useRouter();
  const params = useSearchParams();
  const entityId = params.get("id") || params.get("entityId");
  const bottomRef = useRef<HTMLDivElement>(null);
  const [memories, setMemories] = useState<Memory[]>([]);
  const [selected, setSelected] = useState<Memory|null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [currentEmotion, setCurrentEmotion] = useState<EmotionState>("calm");
  const [relationshipTier, setRelationshipTier] = useState<RelationshipTier>("stranger");
  const [relationshipSummary, setRelationshipSummary] = useState("");

  // Load memories + auto-select by entityId
  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const phone = localStorage.getItem("yj_phone") || localStorage.getItem("yijian_phone") || "";
        const r = await fetch("/api/memories-mvp?phone=" + encodeURIComponent(phone));
        if (r.ok && !cancelled) {
          const list = await r.json();
          setMemories(list || []);
          if (entityId) {
            const found = (list || []).find((m: Memory) => m.id === entityId);
            if (found) selectMemory(found);
          }
        }
      } catch {} finally { if (!cancelled) setLoading(false); }
    }
    load();
    return () => { cancelled = true; };
  }, [entityId]);

  // Scroll to bottom on new messages
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

  // Subscribe to emotion engine
  useEffect(() => {
    const mem = loadMemory();
    setRelationshipTier(mem.tier);
    setRelationshipSummary(getRelationshipSummary(mem));
    setCurrentEmotion(getEmotion());

    return onEmotionChange((change) => {
      setCurrentEmotion(change.emotion);
    });
  }, []);

  function selectMemory(m: Memory) {
    setSelected(m);
    const mem = loadMemory();
    setRelationshipTier(mem.tier);
    setRelationshipSummary(getRelationshipSummary(mem));
    setMessages([{
      role: "assistant",
      content: `${m.name}，我在这里。很高兴再次与你对话。`,
    }]);
  }

  async function send() {
    if (!input.trim() || !selected || sending) return;
    const msg: Message = { role: "user", content: input.trim() };
    setMessages(p => [...p, msg]);
    setInput("");
    setSending(true);
    try {
      const phone = localStorage.getItem("yj_phone") || localStorage.getItem("yijian_phone") || "";
      const r = await fetch("/api/memory-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone, memoryId: selected.id, message: msg.content }),
      });
      const d = await r.json();
      setMessages(p => [...p, { role: "assistant", content: d.reply || d.text || "我在。" }]);
    } catch {
      setMessages(p => [...p, { role: "assistant", content: "我在的，只是现在需要一点时间来回应你。" }]);
    } finally {
      setSending(false);
    }
  }

  // ── Memory Selection Screen ──
  if (!selected) {
    return (
      <motion.div {...M.enter} style={{
        minHeight: "calc(100dvh - var(--nav-height,64px) - env(safe-area-inset-bottom,0px) - 16px)",
        padding: "clamp(20px,5vw,32px) clamp(16px,4vw,24px)",
        background: T.colors.bg,
      }}>
        <h2 style={{ fontSize: "clamp(20px,5vw,26px)", fontWeight: 700, color: T.colors.text, margin: "0 0 4px" }}>
          与谁对话
        </h2>
        <p style={{ fontSize: 12, color: T.colors.textMuted, letterSpacing: "0.04em", margin: "0 0 20px" }}>
          选择一个记忆体，开始温暖的对话
        </p>

        {loading && (
          <div style={{ display: "flex", justifyContent: "center", paddingTop: 40 }}>
            <div style={{
              width: 24, height: 24, borderRadius: "50%",
              border: `2px solid ${T.colors.border}`, borderTopColor: T.colors.primary,
              animation: "spin-ring 0.7s linear infinite",
            }} />
          </div>
        )}

        {!loading && memories.length === 0 && (
          <div style={{ textAlign: "center", paddingTop: 50 }}>
            <p style={{ fontSize: 15, color: T.colors.textMuted, marginBottom: 12 }}>
              还没有记忆体
            </p>
            <button onClick={() => router.push("/create-memory")} style={{
              minHeight: 46, padding: "0 24px", borderRadius: T.radius.lg,
              border: "none", background: T.colors.primary, color: "#FFF",
              fontSize: 14, fontWeight: 600, cursor: "pointer",
            }}>
              去建立连接
            </button>
          </div>
        )}

        {!loading && memories.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }} className="stagger">
            {memories.map(m => (
              <div
                key={m.id}
                onClick={() => selectMemory(m)}
                style={{
                  borderRadius: T.radius.lg,
                  border: `0.5px solid ${T.colors.border}`,
                  background: T.colors.card,
                  boxShadow: T.shadow.card,
                  padding: 16, cursor: "pointer",
                  display: "flex", alignItems: "center", gap: 14,
                }}
              >
                <div style={{
                  width: 44, height: 44, borderRadius: "50%",
                  background: T.colors.primarySoft,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 18, fontWeight: 700, color: T.colors.primary, flexShrink: 0,
                }}>
                  {m.name.charAt(0)}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 15, fontWeight: 600, color: T.colors.text }}>
                    {m.name}
                  </div>
                  {m.relationship && (
                    <div style={{ fontSize: 12, color: T.colors.textMuted, marginTop: 1 }}>
                      {m.relationship}
                    </div>
                  )}
                </div>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
                  stroke={T.colors.textFaint} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="9 18 15 12 9 6" />
                </svg>
              </div>
            ))}
          </div>
        )}
      </motion.div>
    );
  }

  // ── Chat View ──
  const emotionInfo = EMOTION_LABELS[currentEmotion] || EMOTION_LABELS.calm;

  return (
    <div style={{
      display: "flex", flexDirection: "column",
      height: "calc(100dvh - var(--nav-height,64px) - env(safe-area-inset-bottom,0px) - 16px)",
      background: T.colors.bg,
    }}>
      {/* Header — entity identity + emotion */}
      <div style={{
        display: "flex", alignItems: "center", gap: 10,
        padding: "12px 16px",
        borderBottom: `0.5px solid ${T.colors.border}`,
        background: T.colors.card,
        position: "sticky", top: 0, zIndex: 10,
      }}>
        <button
          onClick={() => { setSelected(null); setMessages([]); }}
          style={{
            background: "none", border: "none", cursor: "pointer",
            padding: 6, display: "flex", color: T.colors.textMuted,
          }}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 18 9 12 15 6" />
          </svg>
        </button>

        <div style={{
          width: 36, height: 36, borderRadius: "50%",
          background: T.colors.primarySoft,
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 16, fontWeight: 700, color: T.colors.primary,
        }}>
          {selected.name.charAt(0)}
        </div>

        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 15, fontWeight: 600, color: T.colors.text }}>
            {selected.name}
          </div>
          {selected.relationship && (
            <div style={{ fontSize: 11, color: T.colors.textMuted, letterSpacing: "0.03em" }}>
              {selected.relationship}
            </div>
          )}
        </div>

        {/* Emotion indicator */}
        <div style={{
          display: "flex", alignItems: "center", gap: 4,
          padding: "4px 10px", borderRadius: 12,
          background: `${emotionInfo.color}18`,
        }}>
          <span style={{
            width: 6, height: 6, borderRadius: "50%",
            background: emotionInfo.color,
          }} />
          <span style={{ fontSize: 11, color: emotionInfo.color, fontWeight: 500 }}>
            {emotionInfo.label}
          </span>
        </div>
      </div>

      {/* Messages */}
      <div style={{
        flex: 1, overflowY: "auto",
        padding: "18px 20px",
        display: "flex", flexDirection: "column", gap: 16,
      }}>
        {/* Relationship summary banner */}
        {relationshipSummary && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            style={{
              alignSelf: "center", fontSize: 11, color: T.colors.textFaint,
              padding: "6px 14px", borderRadius: 12,
              background: `${T.colors.primarySoft}40`,
              letterSpacing: "0.03em",
            }}
          >
            {relationshipSummary}
          </motion.div>
        )}

        <AnimatePresence>
          {messages.map((msg, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.35, ease: "easeOut" }}
              style={{
                alignSelf: msg.role === "user" ? "flex-end" : "flex-start",
                maxWidth: "85%",
                padding: "12px 16px",
                borderRadius: msg.role === "user"
                  ? `${T.radius.lg} ${T.radius.lg} 4px ${T.radius.lg}`
                  : `${T.radius.lg} ${T.radius.lg} ${T.radius.lg} 4px`,
                background: msg.role === "user" ? T.colors.primarySoft : T.colors.card,
                color: T.colors.text, fontSize: 15, lineHeight: 1.7,
                boxShadow: msg.role === "assistant" ? T.shadow.card : "none",
              }}
            >
              {msg.content}
            </motion.div>
          ))}
        </AnimatePresence>

        {sending && (
          <div style={{ alignSelf: "flex-start", padding: "8px 0" }}>
            <motion.div
              animate={{ opacity: [0.3, 0.8, 0.3] }}
              transition={{ duration: 1.5, repeat: Infinity }}
              style={{ fontSize: 14, color: T.colors.textMuted, fontStyle: "italic" }}
            >
              正在回应...
            </motion.div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input bar */}
      <div style={{
        padding: "12px 16px",
        borderTop: `0.5px solid ${T.colors.border}`,
        display: "flex", gap: 10, alignItems: "center",
        background: T.colors.card,
      }}>
        <input
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter") send(); }}
          placeholder={`和 ${selected.name} 说点什么...`}
          autoFocus
          style={{
            flex: 1, height: 44, padding: "0 18px",
            borderRadius: 22,
            border: `0.5px solid ${T.colors.border}`,
            background: T.colors.bgWarm,
            color: T.colors.text, fontSize: 15, outline: "none",
          }}
        />
        <button
          onClick={send}
          disabled={!input.trim() || sending}
          style={{
            width: 40, height: 40, borderRadius: "50%", border: "none",
            background: input.trim() ? T.colors.primary : T.colors.border,
            color: input.trim() ? "#FFF" : T.colors.textFaint,
            display: "flex", alignItems: "center", justifyContent: "center",
            cursor: input.trim() ? "pointer" : "default", flexShrink: 0,
          }}
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
            <line x1="22" y1="2" x2="11" y2="13" />
            <polygon points="22 2 15 22 11 13 2 9 22 2" />
          </svg>
        </button>
      </div>
    </div>
  );
}

export default function DialoguePage() {
  return (
    <Suspense fallback={
      <div style={{
        display: "flex", justifyContent: "center", alignItems: "center",
        minHeight: "calc(100dvh - 120px)", background: "#F6F1E8",
      }}>
        <div style={{
          width: 24, height: 24, borderRadius: "50%",
          border: "2px solid rgba(0,0,0,0.06)", borderTopColor: "#D6A86E",
          animation: "spin-ring 0.7s linear infinite",
        }} />
      </div>
    }>
      <DialogueInner />
    </Suspense>
  );
}
