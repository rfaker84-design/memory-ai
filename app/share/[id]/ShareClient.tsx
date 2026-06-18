"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { motion } from "framer-motion";

interface ShareCardData {
  id: string;
  memory_id: string;
  content_text: string;
  emotion_tag: string;
  share_title: string;
  audio_url: string | null;
  video_url: string | null;
  memories?: { name: string; relationship: string; photo_url: string | null };
}

const EMOTION_COLORS: Record<string, { bg: string; accent: string }> = {
  "感动": { bg: "rgba(120,100,180,0.08)", accent: "rgba(140,120,200,0.6)" },
  "思念": { bg: "rgba(60,80,140,0.08)", accent: "rgba(100,140,200,0.5)" },
  "温暖": { bg: "rgba(200,140,80,0.08)", accent: "rgba(220,160,100,0.5)" },
  "遗憾": { bg: "rgba(100,90,80,0.06)", accent: "rgba(140,130,120,0.35)" },
  "治愈": { bg: "rgba(100,160,140,0.08)", accent: "rgba(130,180,160,0.45)" },
  "怀念": { bg: "rgba(160,120,80,0.08)", accent: "rgba(180,140,100,0.45)" },
  "感恩": { bg: "rgba(180,140,100,0.08)", accent: "rgba(200,160,120,0.45)" },
};

export default function ShareClient({ card }: { card: ShareCardData }) {
  const [copied, setCopied] = useState(false);
  const [subtitleIndex, setSubtitleIndex] = useState(0);
  const [currentSubtitle, setCurrentSubtitle] = useState("");
  const [ctaVisible, setCtaVisible] = useState(false);

  const name = card.memories?.name || "TA";
  const relationship = card.memories?.relationship || "";
  const colors = EMOTION_COLORS[card.emotion_tag] || EMOTION_COLORS["治愈"];

  const subtitles = card.content_text
    ? card.content_text.split(/[。！？，；\n]+/).filter(Boolean).map(s => s.trim())
    : ["..."];

  // Subtitle animation
  useEffect(() => {
    if (subtitleIndex < subtitles.length) {
      setCurrentSubtitle(subtitles[subtitleIndex]);
      const timer = setTimeout(() => setSubtitleIndex(i => i + 1), 1800);
      return () => clearTimeout(timer);
    }
  }, [subtitleIndex, subtitles]);

  // Delayed CTA
  useEffect(() => {
    const timer = setTimeout(() => setCtaVisible(true), 5000);
    return () => clearTimeout(timer);
  }, []);

  const handleCopyLink = () => {
    const url = window.location.origin + "/share/" + card.id;
    navigator.clipboard.writeText(url).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <main
      className="fixed inset-0 flex flex-col items-center justify-center overflow-hidden"
      style={{ background: "#0b0b0f" }}
    >
      {/* Emotion glow */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            "radial-gradient(ellipse at 50% 35%, " + colors.bg + " 0%, transparent 55%)",
        }}
      />

      {/* Floating particles */}
      {[...Array(12)].map((_, i) => (
        <motion.div
          key={i}
          className="absolute w-0.5 h-0.5 rounded-full pointer-events-none"
          style={{ background: colors.accent }}
          animate={{
            y: [0, -30, -10, 0],
            opacity: [0, 0.35, 0.2, 0],
          }}
          transition={{
            duration: 5 + i * 0.6,
            delay: i * 0.5,
            repeat: Infinity,
          }}
        />
      ))}

      <div className="relative z-10 text-center px-8 max-w-sm">
        {/* Emotion tag */}
        <motion.div
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          className="inline-flex items-center gap-1.5 rounded-full px-4 py-1.5 mb-6"
          style={{
            background: "rgba(255,255,255,0.02)",
            border: "0.5px solid rgba(255,255,255,0.05)",
          }}
        >
          <span className="text-[11px] tracking-[0.1em]" style={{ color: colors.accent }}>
            {card.emotion_tag}
          </span>
        </motion.div>

        {/* Name + relationship */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
        >
          <h1
            className="text-[28px] font-light tracking-[0.1em] mb-1"
            style={{ color: "rgba(225,215,195,0.88)", margin: 0 }}
          >
            {name}
          </h1>
          {relationship && (
            <p
              className="text-[12px] tracking-[0.12em] mb-8"
              style={{ color: "rgba(180,170,150,0.3)", margin: 0 }}
            >
              {relationship}
            </p>
          )}
        </motion.div>

        {/* Title */}
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.4 }}
          className="text-[17px] italic mb-8 leading-relaxed"
          style={{ color: "rgba(220,210,190,0.65)", margin: 0 }}
        >
          {card.share_title}
        </motion.p>

        {/* Content card */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.6 }}
          className="rounded-2xl p-6 mb-8 text-left"
          style={{
            background: "rgba(22,20,32,0.65)",
            border: "0.5px solid rgba(255,255,255,0.04)",
          }}
        >
          <p
            className="text-[15px] leading-relaxed italic"
            style={{
              color: "rgba(200,190,170,0.7)",
              margin: 0,
              letterSpacing: "0.03em",
              transition: "opacity 0.4s",
            }}
          >
            「{currentSubtitle || subtitles[0]}」
          </p>
        </motion.div>

        {/* CTA */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{
            opacity: ctaVisible ? 1 : 0,
            y: ctaVisible ? 0 : 10,
          }}
          transition={{ duration: 0.6 }}
          className="flex flex-col gap-3"
        >
          <Link
            href="/signup"
            className="block rounded-full py-3.5 text-[14px] tracking-[0.08em] font-light transition-all text-center hover:opacity-90"
            style={{
              background: "rgba(140,120,180,0.12)",
              border: "0.5px solid rgba(180,160,200,0.2)",
              color: "rgba(225,215,190,0.85)",
              textDecoration: "none",
            }}
          >
            我也想创造属于我的记忆
          </Link>

          <button
            onClick={handleCopyLink}
            className="text-[12px] tracking-[0.08em]"
            style={{
              color: copied ? "rgba(180,160,200,0.5)" : "rgba(180,170,150,0.25)",
              background: "none",
              border: "none",
              cursor: "pointer",
            }}
          >
            {copied ? "✓ 已复制链接" : "复制分享链接"}
          </button>
        </motion.div>
      </div>

      {/* Brand */}
      <motion.p
        initial={{ opacity: 0 }}
        animate={{ opacity: 0.2 }}
        transition={{ delay: 3 }}
        className="absolute bottom-8 text-[11px] tracking-[0.12em]"
        style={{ color: "rgba(160,150,140,0.4)", margin: 0 }}
      >
        忆见 · 让思念有回音
      </motion.p>
    </main>
  );
}
