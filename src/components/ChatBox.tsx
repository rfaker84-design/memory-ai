"use client";
import { useState, useRef, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import PresenceAvatar from "./PresenceAvatar";
import { generateShareCard } from "../lib/share";
import type { Emotion } from "../lib/volc";
import { updateEmotion } from "../lib/emotionEngine";

// ������ Types ����������������������������������������������������������������������������������������������������
type Message = {
  role: "user" | "assistant" | "system";
  content: string;
  emotion?: Emotion;
};

interface ChatBoxProps {
  memoryId: string;
  memoryName: string;
  relationship: string | null;
  lifeStory: string | null;
  avatarUrl: string | null;
  onAvatarGenerated?: (url: string) => void;
}

const FREE_MESSAGE_LIMIT = 15;
const VIP_NUDGE_THRESHOLD = 10;

// ������ Component ��������������������������������������������������������������������������������������������
export default function ChatBox({
  memoryId, memoryName, relationship, lifeStory,
  avatarUrl: initialAvatar, onAvatarGenerated,
}: ChatBoxProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [emotion, setEmotion] = useState<Emotion>("calm");
  const [speaking, setSpeaking] = useState(false);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(initialAvatar);
  const [messageCount, setMessageCount] = useState(0);
  const [showVIPNudge, setShowVIPNudge] = useState(false);
  const [firstMessageLoaded, setFirstMessageLoaded] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Scroll to bottom on messages change
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

  // ������ Load count from localStorage ����������������������������������������������������
  useEffect(() => {
    const stored = localStorage.getItem("yijian_msg_count_" + memoryId);
    if (stored) setMessageCount(parseInt(stored, 10));
  }, [memoryId]);

  // ������ Show first warm message ��������������������������������������������������������������
  useEffect(() => {
    if (!firstMessageLoaded && lifeStory) {
      setFirstMessageLoaded(true);
      const delay = 800;
      const timer = setTimeout(() => {
        setMessages([{
          role: "assistant",
          content: "��һֱ�ڵ��㡣",
          emotion: "warm",
        }]);
        setEmotion("warm"); updateEmotion("warm", 0.7, "chat");
      }, delay);
      return () => clearTimeout(timer);
    }
  }, [lifeStory, firstMessageLoaded]);

  // ������ ������Ƶ ����������������������������������������������������������������������������������������
  const playAudio = useCallback((url: string) => {
    if (audioRef.current) { audioRef.current.pause(); }
    const audio = new Audio(url);
    audioRef.current = audio;
    setSpeaking(true);
    audio.onended = () => setSpeaking(false);
    audio.onerror = () => setSpeaking(false);
    audio.play().catch(() => setSpeaking(false));
  }, []);

  // ������ ������Ϣ ����������������������������������������������������������������������������������������
  const sendMessage = useCallback(async () => {
    const text = input.trim();
    if (!text || sending) return;

    setMessages(prev => [...prev, { role: "user", content: text }]);
    setInput("");
    setSending(true);
    setEmotion("calm");

    const newCount = messageCount + 1;
    setMessageCount(newCount);
    localStorage.setItem("yijian_msg_count_" + memoryId, newCount.toString());

    // Check VIP nudge
    if (newCount >= VIP_NUDGE_THRESHOLD && newCount < FREE_MESSAGE_LIMIT) {
      setShowVIPNudge(true);
    }

    // Free limit check
    if (newCount > FREE_MESSAGE_LIMIT) {
      setMessages(prev => [...prev, {
        role: "system",
        content: "?? ��ѶԻ����������ꡣ����VIP�ɽ������޶Ի������ļ������ӡ�",
      }]);
      setSending(false);
      return;
    }

    try {
      const res = await fetch("/api/memory-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          memoryId,
          history: messages.slice(-8).map(m => ({
            role: m.role,
            content: m.content,
          })),
          message: text,
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        setMessages(prev => [...prev, {
          role: "assistant",
          content: err.error || "AI������ʱ�����ã����Ժ����ԡ�",
          emotion: "calm",
        }]);
        setSending(false);
        return;
      }

      const data = await res.json();

      const reply = data.reply || data.text || data.answer;
      if (reply) {
        const msgEmotion: Emotion = data.emotion || "calm";
        setMessages(prev => [...prev, {
          role: "assistant",
          content: reply,
          emotion: msgEmotion,
        }]);
        setEmotion(msgEmotion); updateEmotion(msgEmotion, 0.6, "chat");
      }

      if (data.avatarUrl) {
        setAvatarUrl(data.avatarUrl);
        onAvatarGenerated?.(data.avatarUrl);
      }

      if (data.audioUrl) {
        playAudio(data.audioUrl);
      }
    } catch {
      setMessages(prev => [...prev, {
        role: "assistant",
        content: "���������쳣�������ԡ�",
        emotion: "calm",
      }]);
    }

    setSending(false);
  }, [input, sending, messages, memoryId, memoryName, relationship, lifeStory, playAudio, onAvatarGenerated, messageCount]);

  // ������ Share handler ����������������������������������������������������������������������������������
  const handleShare = useCallback(async () => {
    const lastAssistantMsg = [...messages].reverse().find(m => m.role === "assistant");
    const card = await generateShareCard(memoryId, lastAssistantMsg?.content);
    if (card) {
      const shareUrl = window.location.origin + "/share/" + card.id;
      try {
        await navigator.clipboard.writeText(shareUrl);
        // Could show a toast here
      } catch { /* ignore */ }
    }
  }, [messages, memoryId]);

  return (
    <div className="flex flex-col h-full" style={{ background: "#0b0b0f" }}>

      {/* Emotion-reactive background aura */}
      <div
        className="absolute top-0 left-0 right-0 h-56 pointer-events-none transition-all duration-1000"
        style={{
          background: (() => { const gc: Record<string,string> = { warm: "radial-gradient(ellipse at 50% 10%, rgba(255,170,80,0.08) 0%, transparent 70%)", calm: "radial-gradient(ellipse at 50% 10%, rgba(130,180,230,0.06) 0%, transparent 70%)", sad: "radial-gradient(ellipse at 50% 10%, rgba(140,150,170,0.05) 0%, transparent 70%)", nostalgic: "radial-gradient(ellipse at 50% 10%, rgba(210,160,100,0.07) 0%, transparent 70%)" }; return gc[emotion] || gc.calm; })()
        }}
      />
      {/* ���� ���������� ���������������������������������������������������������������������������� */}
      <div className="flex flex-col items-center pt-6 pb-3 shrink-0" style={{ borderBottom: "0.5px solid rgba(255,255,255,0.03)" }}>
        <PresenceAvatar
          avatarUrl={avatarUrl}
          name={memoryName}
          emotion={emotion}
          speaking={speaking}
          listening={sending}
          size={160}
        />
      </div>

      {/* ���� VIP soft nudge ������������������������������������������������������������������������ */}
      <AnimatePresence>
        {showVIPNudge && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="px-5 overflow-hidden"
          >
            <div
              className="rounded-xl px-4 py-2.5 flex items-center justify-between"
              style={{
                background: "rgba(140,120,180,0.06)",
                border: "0.5px solid rgba(180,160,200,0.1)",
              }}
            >
              <p
                className="text-[11px] tracking-[0.04em]"
                style={{ color: "rgba(200,180,210,0.5)", margin: 0 }}
              >
                ��ʣ {FREE_MESSAGE_LIMIT - messageCount} �������Ϣ �� ����VIP�����������
              </p>
              <button
                onClick={() => setShowVIPNudge(false)}
                className="text-[11px] ml-3"
                style={{
                  color: "rgba(200,180,210,0.35)",
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                }}
              >
                ?
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ���� ��Ϣ�б� �������������������������������������������������������������������������������� */}
      <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
        <AnimatePresence>
          {messages.map((msg, i) => {
            const isSystem = msg.role === "system";
            return (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3 }}
                className={"flex " + (
                  isSystem ? "justify-center" :
                  msg.role === "user" ? "justify-end" : "justify-start"
                )}
              >
                <div
                  className={
                    isSystem
                      ? "max-w-[85%] rounded-xl px-4 py-2.5 text-center"
                      : "max-w-[80%] rounded-2xl px-5 py-3"
                  }
                  style={{
                    background: isSystem
                      ? "rgba(140,120,180,0.05)"
                      : msg.role === "user"
                        ? "rgba(100,80,160,0.12)"
                        : "rgba(28,26,40,0.65)",
                    border: isSystem
                      ? "0.5px solid rgba(180,160,200,0.08)"
                      : "0.5px solid " + (msg.role === "user"
                        ? "rgba(140,120,200,0.1)"
                        : "rgba(255,255,255,0.035)"),
                  }}
                >
                  <p
                    className={isSystem ? "text-[11px]" : "text-[14px] leading-relaxed"}
                    style={{
                      color: isSystem
                        ? "rgba(200,180,210,0.5)"
                        : msg.role === "user"
                          ? "rgba(215,200,225,0.82)"
                          : "rgba(200,190,170,0.72)",
                      margin: 0,
                      letterSpacing: "0.03em",
                    }}
                  >
                    {msg.content}
                  </p>
                </div>
              </motion.div>
            );
          })}

          {sending && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex justify-start">
              <div
                className="rounded-2xl px-5 py-3 flex gap-2"
                style={{
                  background: "rgba(28,26,40,0.4)",
                  border: "0.5px solid rgba(255,255,255,0.025)",
                }}
              >
                {[0, 1, 2].map(i => (
                  <motion.div
                    key={i}
                    animate={{ opacity: [0.2, 0.6, 0.2], y: [0, -4, 0] }}
                    transition={{ duration: 1.2, repeat: Infinity, delay: i * 0.2 }}
                    className="w-1.5 h-1.5 rounded-full"
                    style={{ background: "rgba(180,160,210,0.55)" }}
                  />
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
        <div ref={bottomRef} />
      </div>

      {/* ���� ������ ������������������������������������������������������������������������������������ */}
      <div
        className="shrink-0 px-4 py-4"
        style={{ borderTop: "0.5px solid rgba(255,255,255,0.03)" }}
      >
        <div className="flex items-center gap-3 max-w-lg mx-auto">
          {/* Share button */}
          {messages.length > 0 && (
            <motion.button
              whileHover={{ scale: 1.06 }}
              whileTap={{ scale: 0.94 }}
              onClick={handleShare}
              className="rounded-full w-8 h-8 flex items-center justify-center shrink-0"
              style={{
                background: "rgba(255,255,255,0.02)",
                border: "0.5px solid rgba(255,255,255,0.04)",
                cursor: "pointer",
              }}
              title="�������俨Ƭ"
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none"
                stroke="rgba(180,170,150,0.4)" strokeWidth="1.5">
                <path d="M4 12v8a2 2 0 002 2h12a2 2 0 002-2v-8M16 6l-4-4-4 4M12 2v13" />
              </svg>
            </motion.button>
          )}

          <input
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                sendMessage();
              }
            }}
            placeholder={sending ? "�Է����ڻ�Ӧ..." : "˵Щʲô..."}
            disabled={sending}
            className="flex-1 bg-transparent text-[16px] outline-none px-4 py-3.5 rounded-2xl transition-opacity"
            style={{
              minHeight: 52,
              color: "rgba(220,210,190,0.82)",
              caretColor: "rgba(180,160,200,0.6)",
              border: "0.5px solid rgba(255,255,255,0.06)",
              background: "rgba(18,16,28,0.55)",
              opacity: sending ? 0.4 : 1,
            }}
          />
          <motion.button
            whileHover={{ scale: 1.06 }}
            whileTap={{ scale: 0.94 }}
            onClick={sendMessage}
            disabled={!input.trim() || sending}
            className="rounded-full w-10 h-10 flex items-center justify-center shrink-0 transition-all"
            style={{
              background: input.trim() && !sending
                ? "rgba(130,110,190,0.22)"
                : "rgba(255,255,255,0.03)",
              border: "0.5px solid rgba(255,255,255,0.06)",
              cursor: input.trim() && !sending ? "pointer" : "default",
              opacity: input.trim() && !sending ? 1 : 0.3,
            }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
              stroke="rgba(200,180,160,0.6)" strokeWidth="1.5">
              <path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z" />
            </svg>
          </motion.button>
        </div>
      </div>
    </div>
  );
}
