"use client";

import { use, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import PresenceAvatar from "../../../src/components/PresenceAvatar";
import type { Emotion } from "../../../src/lib/volc";
import { store } from "../../../src/lib/store";
import { getEmotionState, updateEmotion, EMOTION_UI } from "../../../src/lib/emotionEngine";

type Memory = {
  id: string;
  name: string;
  relationship: string | null;
  life_story: string | null;
  avatar_image_url?: string | null;
};

export default function MemoryRoomPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();
  const [memory, setMemory] = useState<Memory | null>(null);
  const [loading, setLoading] = useState(true);
  const [fragments, setFragments] = useState<string[]>([]);
  const [emotion, setEmotion] = useState<Emotion>("calm");
  const [activeFragment, setActiveFragment] = useState(0);
  const [exiting, setExiting] = useState(false);

  // Load memory & sync emotion from global store
  useEffect(() => {
    const phone = localStorage.getItem("yijian_phone");
    if (!phone) {
      router.push("/");
      return;
    }
    fetch("/api/memories-mvp?phone=" + encodeURIComponent(phone))
      .then((r) => r.json())
      .then((data: Memory[]) => {
        const found = data.find((m) => m.id === id);
        if (found) {
          setMemory(found);
          if (found.life_story) {
            const sentences = found.life_story
              .split(/[。！？.!?]/)
              .map((s) => s.trim())
              .filter((s) => s.length > 4 && s.length < 55)
              .slice(0, 6);
            setFragments(sentences);
          }

          // Use global emotion state first; fall back to text-based detection
          const globalEmo = getEmotionState();
          if (globalEmo.source !== "init" && globalEmo.intensity > 0.2) {
            setEmotion(globalEmo.type);
          } else if (found.life_story) {
            const story = found.life_story;
            if (/开心|温暖|幸福|爱/.test(story)) { setEmotion("warm"); updateEmotion("warm", 0.5, "system"); }
            else if (/难过|悲伤|痛|哭/.test(story)) { setEmotion("sad"); updateEmotion("sad", 0.5, "system"); }
            else if (/怀念|记得|曾经|那时/.test(story)) { setEmotion("nostalgic"); updateEmotion("nostalgic", 0.5, "system"); }
            else { setEmotion("calm"); }
          }
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [id, router]);

  // Poll global emotion for real-time sync
  useEffect(() => {
    const interval = setInterval(() => {
      const globalEmo = getEmotionState();
      if (globalEmo.source !== "init") {
        setEmotion(globalEmo.type);
      }
    }, 2000);
    return () => clearInterval(interval);
  }, []);

  // Cycle through fragments
  useEffect(() => {
    if (fragments.length === 0) return;
    const interval = setInterval(() => {
      setActiveFragment((prev) => (prev + 1) % fragments.length);
    }, 4000);
    return () => clearInterval(interval);
  }, [fragments]);

  // Enter chat with emotional collapse
  function handleEnterChat() {
    setExiting(true);
    setTimeout(() => router.push("/chat?id=" + id), 1500);
  }

  // ─── Intensity-driven visuals ──────────────────────────────
  const emoState = getEmotionState();
  const emoUI = EMOTION_UI[emotion] || EMOTION_UI.calm;
  const intensityFactor = emoState.type === emotion ? emoState.intensity : 0.5;
  const glowOpacity = 0.06 + intensityFactor * 0.12;
  const fragmentOpacity = 0.18 + intensityFactor * 0.2;

  if (loading) {
    return (
      <main
        className="fixed inset-0 flex items-center justify-center"
        style={{ background: "#0b0b0f" }}
      >
        <motion.div
          animate={{ opacity: [0.06, 0.3, 0.06] }}
          transition={{ duration: 3, repeat: Infinity }}
          className="w-2 h-2 rounded-full"
          style={{ background: "rgba(180,160,130,0.35)" }}
        />
      </main>
    );
  }

  if (!memory) {
    return (
      <main className="fixed inset-0 flex flex-col items-center justify-center gap-6" style={{ background: "#0b0b0f" }}>
        <p style={{ color: "rgba(160,150,130,0.12)", fontSize: 13, margin: 0 }}>找不到这段记忆</p>
        <button
          onClick={() => router.push("/memories")}
          className="text-[12px] tracking-[0.06em]"
          style={{ color: "rgba(180,170,150,0.25)", background: "none", border: "none", cursor: "pointer" }}
        >返回记忆列表</button>
      </main>
    );
  }

  return (
    <main
      className="fixed inset-0 overflow-hidden flex flex-col items-center justify-center"
      style={{ background: "#0b0b0f", paddingBottom: "calc(64px + env(safe-area-inset-bottom, 0px))" }}
    >
      {/* Emotion-reactive background — intensity driven */}
      <motion.div
        className="absolute inset-0 pointer-events-none"
        animate={{ opacity: [0.4 * intensityFactor, 0.7 * intensityFactor, 0.4 * intensityFactor] }}
        transition={{ duration: 8, repeat: Infinity, ease: "easeInOut" }}
        style={{
          background: "radial-gradient(ellipse at 50% 40%, " + emoUI.glow + glowOpacity + ") 0%, transparent 55%)",
        }}
      />

      {/* Floating memory fragments — intensity affects visibility */}
      {fragments.map((frag, i) => (
        <motion.p
          key={i}
          initial={{ opacity: 0.2 }}
          animate={{
            opacity:
              i === activeFragment
                ? [0, fragmentOpacity, fragmentOpacity * 0.85, 0]
                : [0, fragmentOpacity * 0.3, fragmentOpacity * 0.25, 0],
            y: [8, -4, -14, -24],
          }}
          transition={{
            duration: 7,
            delay: i * 0.6,
            repeat: Infinity,
            repeatDelay: fragments.length * 0.8,
          }}
          className="absolute text-[14px] italic pointer-events-none"
          style={{
            color: emoUI.glow + "0.45)",
            left: (18 + (i * 27) % 58).toString() + "%",
            top: (12 + (i * 19) % 60).toString() + "%",
            letterSpacing: "0.04em",
            margin: 0,
            maxWidth: 200,
          }}
        >
          {frag}
        </motion.p>
      ))}

      {/* Center: Avatar + Name */}
      <div className="relative z-10 flex flex-col items-center">
        {/* Presence Avatar */}
        <motion.div
          initial={{ opacity: 0.3, scale: 0.92, filter: "blur(6px)" }}
          animate={{ opacity: 1, scale: 1, filter: "blur(0px)" }}
          transition={{ duration: 1.8, ease: "easeOut" }}
        >
          <PresenceAvatar
            avatarUrl={memory.avatar_image_url || null}
            name={memory.name}
            emotion={emotion}
            speaking={false}
            listening={false}
            size={220}
          />
        </motion.div>

        {/* Relationship hint */}
        {memory.relationship && (
          <motion.p
            initial={{ opacity: 0.2 }}
            animate={{ opacity: 0.25 }}
            transition={{ delay: 1, duration: 1.5 }}
            className="mt-2 text-[11px] tracking-[0.12em]"
            style={{ color: "rgba(200,190,170,0.5)", margin: 0 }}
          >
            {memory.relationship}
          </motion.p>
        )}

        {/* Active memory fragment — center highlight */}
        {fragments.length > 0 && (
          <motion.p
            key={activeFragment}
            initial={{ opacity: 0.4, y: 6, filter: "blur(3px)" }}
            animate={{ opacity: fragmentOpacity, y: 0, filter: "blur(0px)" }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 1.2 }}
            className="mt-6 text-[15px] italic text-center max-w-[260px] leading-relaxed"
            style={{
              color: emoUI.glow + "0.65)",
              margin: 0,
              letterSpacing: "0.04em",
            }}
          >
            「{fragments[activeFragment]}」
          </motion.p>
        )}

        {/* Enter chat */}
        <motion.button
          initial={{ opacity: 0.2 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 2, duration: 1.5 }}
          whileHover={{ scale: 1.03, background: "rgba(140,120,180,0.1)" }}
          onClick={handleEnterChat}
          className="mt-10 rounded-full px-9 py-2.5 text-[13px] tracking-[0.1em] transition-all"
          style={{
            background: "rgba(140,120,180,0.05)",
            border: "0.5px solid rgba(180,160,200,0.15)",
            color: "rgba(200,180,210,0.5)",
            cursor: "pointer",
          }}
        >
          进入对话
        </motion.button>
      </div>

      {/* Exit transition: emotional collapse */}
      {exiting && (
        <motion.div
          initial={{ opacity: 0.2 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.5 }}
          className="absolute inset-0 z-50 pointer-events-none"
        >
          {/* Light collapses inward */}
          <motion.div
            initial={{ scale: 1.6, opacity: 0.2 }}
            animate={{ scale: 0, opacity: 0.5 }}
            transition={{ duration: 1.4, ease: "easeIn" }}
            className="absolute rounded-full"
            style={{
              left: "50%",
              top: "50%",
              width: 400,
              height: 400,
              transform: "translate(-50%, -50%)",
              background:
                "radial-gradient(circle, " + emoUI.glow + "0.25) 0%, transparent 60%)",
            }}
          />
          {/* Fade to dark */}
          <motion.div
            initial={{ opacity: 0.2 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.6, duration: 0.5 }}
            className="absolute inset-0"
            style={{ background: "#0b0b0f" }}
          />
        </motion.div>
      )}
    </main>
  );
}
