"use client";

import { use, useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { pageTransition, cardMotion } from "../../lib/motion";
import ThinkingIndicator from "../../../components/thinking-indicator";
import { supabase } from "../../../src/lib/supabase";

type Memory = {
  id: string; name: string; relationship: string; life_story: string | null;
  personality_profile: string | null; photo_url: string | null; user_phone: string | null;
};

type ChatMessage = { id?: string; role: "user" | "assistant"; content: string; };

export default function VoiceChatPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const [phone, setPhone] = useState("");
  const [memory, setMemory] = useState<Memory | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [recording, setRecording] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [status, setStatus] = useState("ready");
  const [audioUrl, setAudioUrl] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    const p = localStorage.getItem("yijian_phone");
    if (!p) { window.location.href = "/login"; return; }
    setPhone(p);
  }, []);

  const loadMemory = useCallback(async () => {
    const { data } = await supabase.from("memories").select("*").eq("id", id).single();
    if (data) setMemory(data as Memory);
  }, [id]);

  const loadMessages = useCallback(async () => {
    const { data } = await supabase.from("chat_messages").select("*").eq("memory_id", id).order("created_at", { ascending: true });
    setMessages((data || []) as ChatMessage[]);
  }, [id]);

  useEffect(() => { loadMemory(); loadMessages(); }, [loadMemory, loadMessages]);

  useEffect(() => {
    return () => { if (streamRef.current) streamRef.current.getTracks().forEach((t) => t.stop()); };
  }, []);

  const startRecording = async () => {
    try {
      setError("");
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const recorder = new MediaRecorder(stream, { mimeType: MediaRecorder.isTypeSupported("audio/webm;codecs=opus") ? "audio/webm;codecs=opus" : "audio/webm" });
      audioChunksRef.current = [];
      recorder.ondataavailable = (e) => { if (e.data.size > 0) audioChunksRef.current.push(e.data); };
      recorder.onstop = async () => { await handleRecordingComplete(); };
      mediaRecorderRef.current = recorder;
      recorder.start();
      setRecording(true);
      setStatus("listening");
    } catch { setError("无法访问麦克风，请检查浏览器权限"); }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === "recording") {
      mediaRecorderRef.current.stop();
      setRecording(false);
      if (streamRef.current) { streamRef.current.getTracks().forEach((t) => t.stop()); streamRef.current = null; }
    }
  };

  const handleRecordingComplete = async () => {
    const audioBlob = new Blob(audioChunksRef.current, { type: "audio/webm" });
    if (audioBlob.size < 100) { setStatus("ready"); setError("未检测到声音，请重试"); return; }
    setProcessing(true); setStatus("thinking");
    try {
      const base64 = await blobToBase64(audioBlob);
      const sttRes = await fetch("/api/stt", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ audioBase64: base64, audioFormat: "webm" }) });
      const sttData = await sttRes.json();
      if (!sttRes.ok || sttData.error) throw new Error(sttData.error || "语音识别失败");
      const userText = sttData.text || "（未识别到内容）";
      const userMsg: ChatMessage = { role: "user", content: userText };
      setMessages((prev) => [...prev, userMsg]);
      const phoneNum = phone || localStorage.getItem("yijian_phone") || "";
      const chatRes = await fetch("/api/memory-chat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ memory_id: id, user_phone: phoneNum, name: memory?.name || "", relationship: memory?.relationship || "", life_story: memory?.life_story || "", personality_profile: memory?.personality_profile || "", question: userText }) });
      const chatData = await chatRes.json();
      if (!chatRes.ok || chatData.error) throw new Error(chatData.error || "AI 回复失败");
      const aiText = chatData.answer || "";
      const aiMsg: ChatMessage = { role: "assistant", content: aiText };
      setMessages((prev) => [...prev, aiMsg]);
      setStatus("speaking");
      const ttsRes = await fetch("/api/tts", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text: aiText }) });
      const ttsData = await ttsRes.json();
      if (!ttsRes.ok || ttsData.error) throw new Error(ttsData.error || "语音合成失败");
      if (!ttsData.audioBase64) throw new Error("未收到语音数据");
      const binary = atob(ttsData.audioBase64);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
      const blob = new Blob([bytes], { type: "audio/mp3" });
      const url = URL.createObjectURL(blob);
      setAudioUrl(url);
      if (audioRef.current) { audioRef.current.src = url; await audioRef.current.play(); }
      setStatus("ready");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "出错了");
      setStatus("ready");
    } finally { setProcessing(false); }
  };

  return (
    <motion.div {...pageTransition} className="">
      {/* Header */}
      <header className="sticky top-0 z-10 border-b border-white/[0.04] bg-bg/85 backdrop-blur-md px-5 py-3">
        <div className="mx-auto flex max-w-lg items-center justify-between">
          <Link href={"/memory-chat/" + id} className="text-[13px] text-text-muted hover:text-text-soft transition-colors">&larr; 文字聊天</Link>
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-online animate-pulse-dot animate-glow-pulse" />
            <h1 className="text-lg font-semibold text-text">{memory?.name || "正在连接..."}</h1>
          </div>
          <Link href="/" className="text-[13px] text-text-muted hover:text-text-soft transition-colors">返回</Link>
        </div>
      </header>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-5 py-6">
        <div className="mx-auto max-w-lg">
          {messages.length === 0 && (
            <div className="mt-16 text-center animate-fade-in-up">
              <div className="mx-auto mb-5 h-24 w-24 overflow-hidden rounded-full ring-2 ring-primary/30">
                {memory?.photo_url ? (
                  <img src={memory.photo_url} alt={memory?.name} className="h-full w-full object-cover" />
                ) : (
                  <div className="flex h-full items-center justify-center bg-primary-soft text-3xl text-primary">{memory?.name?.charAt(0) || "?"}</div>
                )}
              </div>
              <p className="text-xl font-semibold text-text">{memory?.name}</p>
              <p className="mt-2 text-[15px] text-text-soft">按住下方按钮开始说话</p>
              <p className="mt-1 text-[13px] text-text-muted">像打电话一样，和{memory?.name || "TA"}聊聊</p>
            </div>
          )}

          {messages.map((msg, i) => (
            <div key={i} className={"mb-4 flex animate-fade-in-up " + (msg.role === "user" ? "justify-end" : "justify-start")}>
              <div className={"max-w-[80%] rounded-2xl px-5 py-3 " + (msg.role === "assistant" ? "bg-surface text-text animate-slow-breathe" : "bg-primary text-black")}>
                {msg.role === "assistant" && <p className="mb-1 text-[11px] font-medium text-primary">{memory?.name}</p>}
                <p className="whitespace-pre-wrap text-[15px] leading-relaxed">{msg.content}</p>
                {msg.role === "assistant" && audioUrl && i === messages.length - 1 && (
                  <button onClick={() => audioRef.current?.play()} className="mt-2 text-[12px] text-primary/60 hover:text-primary transition-colors">🎧 重新播放</button>
                )}
              </div>
            </div>
          ))}

          {/* Status */}
          {status !== "ready" && (
            <div className="mb-4 flex justify-center animate-fade-in">
              <div className="rounded-full bg-surface px-5 py-2.5 text-[13px] text-text-soft">
                {status === "listening" && <ThinkingIndicator name={memory?.name || "TA"} state="thinking" />}
                {status === "thinking" && <ThinkingIndicator name={memory?.name || "TA"} state="thinking" />}
                {status === "speaking" && "🎧 " + (memory?.name || "TA") + " 正在说话..."}
              </div>
            </div>
          )}

          {error && (
            <div className="mb-4 flex justify-center animate-fade-in">
              <div className="rounded-full bg-rose/10 px-5 py-2.5 text-[13px] text-rose">{error}</div>
            </div>
          )}

          <div ref={(el) => { el?.scrollIntoView({ behavior: "smooth" }); }} />
        </div>
      </div>

      {/* Record button */}
      <div className="border-t border-white/[0.04] bg-gradient-to-t from-bg via-bg/95 to-transparent px-5 pb-8 pt-4">
        <div className="mx-auto max-w-md flex flex-col items-center gap-3">
          <button
            onMouseDown={startRecording}
            onMouseUp={stopRecording}
            onTouchStart={startRecording}
            onTouchEnd={stopRecording}
            onMouseLeave={stopRecording}
            disabled={processing}
            className={"flex h-20 w-20 items-center justify-center rounded-full transition-all duration-300 " +
              (recording ? "scale-110 bg-rose shadow-lg shadow-rose/30" :
               processing ? "bg-text-muted/20 cursor-not-allowed" :
               "bg-primary text-black hover:shadow-lg hover:-translate-y-0.5")}
          >
            <span className="text-2xl">{recording ? "🎤" : processing ? "⏳" : "🎤"}</span>
          </button>
          <p className="text-[12px] text-text-muted">
            {recording ? "松开发送" : processing ? "正在听..." : "按住说话"}
          </p>
        </div>
      </div>
      <audio ref={audioRef} className="hidden" />
    </motion.div>
  );
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}