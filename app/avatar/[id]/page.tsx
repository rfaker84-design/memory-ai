"use client";

import { useEffect, useState, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { supabase } from "../../../src/lib/supabase";

type Memory = {
  id: string; name: string; relationship: string; photo_url: string | null;
  voice_sample_url: string | null; avatar_video_url: string | null;
};

/* ================================================================
   Reveal — pure presence, no tech language
   ================================================================ */
const phases = ["TA在这里", "TA看着你", "你们重新见面了"];

export default function AvatarPresencePage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [memory, setMemory] = useState<Memory | null>(null);
  const [loading, setLoading] = useState(true);
  const [phase, setPhase] = useState(0);
  const [visible, setVisible] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const [audioStarted, setAudioStarted] = useState(false);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from("memories").select("*").eq("id", id).single();
      if (!data) { router.push("/"); return; }
      setMemory(data as Memory);
      setLoading(false);
    })();
  }, [id, router]);

  /* ---- Slow reveal sequence ---- */
  useEffect(() => {
    if (loading || !memory) return;
    const t1 = setTimeout(() => setPhase(1), 1600);
    const t2 = setTimeout(() => setPhase(2), 3200);
    const t3 = setTimeout(() => setVisible(true), 4800);
    const t4 = setTimeout(() => {
      if (audioRef.current && !audioStarted) {
        audioRef.current.play().catch(() => {});
        setAudioStarted(true);
      }
    }, 5600);
    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); clearTimeout(t4); };
  }, [loading, memory, audioStarted]);

  const handleLeave = () => {
    setLeaving(true);
    setTimeout(() => router.push("/"), 1800);
  };

  if (loading || !memory) {
    return (
      <main className="fixed inset-0 flex items-center justify-center" style={{ background: "#1E1A16" }}>
        <motion.div
          animate={{ opacity: [0.2, 0.5, 0.2] }}
          transition={{ duration: 3, repeat: Infinity }}
          className="w-12 h-12 rounded-full"
          style={{ background: "radial-gradient(circle, rgba(214,191,163,0.06) 0%, transparent 70%)" }}
        />
      </main>
    );
  }

  const hasVideo = !!memory.avatar_video_url;
  const hasVoice = !!memory.voice_sample_url;

  return (
    <>
      <AnimatePresence>
        {leaving && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center"
            style={{ background: "#1E1A16" }}
          >
            <motion.p
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3, duration: 0.8 }}
              style={{ fontSize: 18, fontWeight: 300, color: "#D6BFA3", letterSpacing: "0.06em" }}
            >
              TA会在这里
            </motion.p>
          </motion.div>
        )}
      </AnimatePresence>

      <main className="fixed inset-0 bg-black overflow-hidden">
        {/* ---- Background: dim ambient field ---- */}
        <div className="absolute inset-0">
          <div style={{
            background: "radial-gradient(ellipse 60% 50% at 50% 45%, #2A241D 0%, #1E1A16 40%, #0E0C09 100%)",
            width: "100%", height: "100%",
          }} />

          {/* Vignette */}
          <div className="absolute inset-0" style={{
            background: "linear-gradient(to top, rgba(0,0,0,0.45) 0%, transparent 30%, transparent 70%, rgba(0,0,0,0.2) 100%)",
          }} />

          {/* Breathing warmth */}
          <motion.div
            animate={{ opacity: [0.08, 0.18, 0.08] }}
            transition={{ duration: 7, repeat: Infinity, ease: "easeInOut" }}
            className="absolute inset-0"
            style={{ background: "radial-gradient(ellipse 55% 45% at 50% 48%, rgba(214,191,163,0.06) 0%, transparent 60%)" }}
          />
        </div>

        {/* ---- Avatar: video with breathing zoom ---- */}
        {hasVideo && (
          <motion.video
            ref={videoRef}
            src={memory.avatar_video_url!}
            className="absolute inset-0 w-full h-full object-contain"
            initial={{ opacity: 0, filter: "blur(16px)", scale: 1.06 }}
            animate={visible ? { opacity: 1, filter: "blur(0px)", scale: 1 } : {}}
            transition={{ duration: 2.0, ease: "easeOut" }}
            autoPlay loop muted playsInline
            style={{
              animation: visible ? "avatar-breathe 5s ease-in-out infinite" : "none",
            }}
          />
        )}

        {/* ---- Photo fallback with breathing zoom ---- */}
        {!hasVideo && memory.photo_url && (
          <motion.div
            className="absolute inset-0 flex items-center justify-center"
            initial={{ opacity: 0, filter: "blur(16px)", scale: 1.06 }}
            animate={visible ? { opacity: 1, filter: "blur(0px)", scale: 1 } : {}}
            transition={{ duration: 2.0, ease: "easeOut" }}
          >
            <motion.img
              src={memory.photo_url}
              alt={memory.name}
              className="max-h-[65vh] max-w-[80vw] rounded-3xl object-contain"
              animate={{ scale: [1, 1.006, 1] }}
              transition={{ duration: 5, repeat: Infinity, ease: "easeInOut" }}
              style={{ boxShadow: "0 0 100px rgba(214,191,163,0.06)", animation: "avatar-breathe 6s ease-in-out infinite" }}
            />
          </motion.div>
        )}

        {/* ---- CSS for breathing ---- */}
        <style>{`
          @keyframes avatar-breathe {
            0%, 100% { transform: scale(1); }
            50% { transform: scale(1.008); }
          }
        `}</style>

        {/* ---- Phase text: pure presence ---- */}
        <AnimatePresence mode="wait">
          {phase < phases.length && (
            <motion.div
              key={phase}
              initial={{ opacity: 0, y: 16, filter: "blur(6px)" }}
              animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
              exit={{ opacity: 0, y: -10, filter: "blur(4px)" }}
              transition={{ duration: 1.0, ease: "easeOut" }}
              className="absolute inset-0 flex items-center justify-center z-10"
            >
              <p style={{ fontSize: 24, fontWeight: 300, color: "#F6F1EA", letterSpacing: "0.08em" }}>
                {phases[phase]}
              </p>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ---- Name + relation: appears softly ---- */}
        {visible && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.8, duration: 1.0 }}
            className="absolute bottom-24 w-full text-center z-10"
          >
            <motion.p
              animate={{ opacity: [0.5, 0.8, 0.5] }}
              transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }}
              style={{ fontSize: 16, fontWeight: 300, color: "#F6F1EA", letterSpacing: "0.08em" }}
            >
              {memory.name}
            </motion.p>
            <p style={{ marginTop: 6, fontSize: 13, color: "#A89888", fontWeight: 300 }}>
              {memory.relationship}
            </p>
          </motion.div>
        )}

        {/* ---- Voice ---- */}
        {hasVoice && <audio ref={audioRef} src={memory.voice_sample_url!} preload="auto" />}
        {hasVoice && audioStarted && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.3 }}
            className="absolute bottom-16 w-full text-center z-10"
          >
            <p style={{ fontSize: 13, color: "#D6BFA3", fontWeight: 300, letterSpacing: "0.06em" }}>
              TA在对你说话
            </p>
          </motion.div>
        )}

        {/* ---- Subtle return: barely visible ---- */}
        {visible && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 0.3 }} transition={{ delay: 1.4, duration: 0.6 }}
            className="absolute top-6 left-6 z-20"
          >
            <button
              onClick={handleLeave}
              style={{
                background: "transparent",
                border: "none",
                color: "rgba(255,255,255,0.25)",
                fontSize: 13,
                fontWeight: 300,
                cursor: "pointer",
                letterSpacing: "0.04em",
              }}
            >
              ←
            </button>
          </motion.div>
        )}

        {/* ---- Chat entry: barely there ---- */}
        {visible && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 1.6, duration: 0.6 }}
            className="absolute bottom-8 w-full flex justify-center z-20"
          >
            <motion.button
              whileHover={{ scale: 1.03 }}
              whileTap={{ scale: 0.97 }}
              onClick={() => router.push("/memory-chat/" + memory.id)}
              style={{
                background: "rgba(214,191,163,0.1)",
                backdropFilter: "blur(10px)",
                border: "1px solid rgba(214,191,163,0.12)",
                borderRadius: 999,
                padding: "10px 24px",
                color: "#D6BFA3",
                fontSize: 15,
                fontWeight: 300,
                cursor: "pointer",
                letterSpacing: "0.06em",
                opacity: 0.7,
              }}
            >
              和TA说说话
            </motion.button>
          </motion.div>
        )}
      </main>
    </>
  );
}