"use client";

import { use, useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { supabase } from "../../../src/lib/supabase";

type Memory = {
  id: string;
  name: string;
  relationship: string;
  life_story: string | null;
  personality_profile: string | null;
  photo_url: string | null;
  user_phone: string | null;
};

type ChatMessage = {
  id?: string;
  role: "user" | "assistant";
  content: string;
};

export default function VoiceChatPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
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
  const [status, setStatus] = useState("ready"); // ready | listening | thinking | speaking
  const [audioUrl, setAudioUrl] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    const p = localStorage.getItem("yijian_phone");
    if (!p) {
      window.location.href = "/login";
      return;
    }
    setPhone(p);
  }, []);

  const loadMemory = useCallback(async () => {
    const { data } = await supabase
      .from("memories")
      .select("*")
      .eq("id", id)
      .single();

    if (data) setMemory(data as Memory);
  }, [id]);

  const loadMessages = useCallback(async () => {
    const { data } = await supabase
      .from("chat_messages")
      .select("*")
      .eq("memory_id", id)
      .order("created_at", { ascending: true });

    setMessages((data || []) as ChatMessage[]);
  }, [id]);

  useEffect(() => {
    loadMemory();
    loadMessages();
  }, [loadMemory, loadMessages]);

  // Cleanup audio stream on unmount
  useEffect(() => {
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
      }
    };
  }, []);

  const startRecording = async () => {
    try {
      setError("");
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const recorder = new MediaRecorder(stream, {
        mimeType: MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
          ? "audio/webm;codecs=opus"
          : "audio/webm",
      });

      audioChunksRef.current = [];
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data);
      };

      recorder.onstop = async () => {
        await handleRecordingComplete();
      };

      mediaRecorderRef.current = recorder;
      recorder.start();
      setRecording(true);
      setStatus("listening");
    } catch {
      setError("无法访问麦克风，请检查浏览器权限");
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === "recording") {
      mediaRecorderRef.current.stop();
      setRecording(false);

      // Stop microphone stream
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
      }
    }
  };

  const handleRecordingComplete = async () => {
    const audioBlob = new Blob(audioChunksRef.current, { type: "audio/webm" });
    if (audioBlob.size < 100) {
      setStatus("ready");
      setError("未检测到声音，请重试");
      return;
    }

    setProcessing(true);
    setStatus("thinking");

    try {
      // Step 1: Convert to base64 and send to STT
      const base64 = await blobToBase64(audioBlob);
      const sttRes = await fetch("/api/stt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ audioBase64: base64, audioFormat: "webm" }),
      });

      const sttData = await sttRes.json();
      if (!sttRes.ok || sttData.error) {
        throw new Error(sttData.error || "语音识别失败");
      }

      const userText = sttData.text || "（未识别到内容）";

      // Add user message
      const userMsg: ChatMessage = { role: "user", content: userText };
      setMessages((prev) => [...prev, userMsg]);

      // Step 2: Send to memory-chat
      const phoneNum = phone || localStorage.getItem("yijian_phone") || "";
      const chatRes = await fetch("/api/memory-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          memory_id: id,
          user_phone: phoneNum,
          name: memory?.name || "",
          relationship: memory?.relationship || "",
          life_story: memory?.life_story || "",
          personality_profile: memory?.personality_profile || "",
          question: userText,
          timeline: [],
        }),
      });

      const chatData = await chatRes.json();
      if (!chatRes.ok || chatData.error) {
        throw new Error(chatData.error || "AI回复失败");
      }

      const aiText = chatData.answer;
      const aiMsg: ChatMessage = { role: "assistant", content: aiText };
      setMessages((prev) => [...prev, aiMsg]);

      // Step 3: TTS
      setStatus("speaking");
      const ttsRes = await fetch("/api/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: aiText }),
      });

      const ttsData = await ttsRes.json();
      if (!ttsRes.ok || ttsData.error) {
        throw new Error(ttsData.error || "语音合成失败");
      }

      const audioSrc = "data:audio/mp3;base64," + ttsData.audioBase64;
      setAudioUrl(audioSrc);

      // Play audio
      if (audioRef.current) {
        audioRef.current.src = audioSrc;
        audioRef.current.onended = () => {
          setStatus("ready");
          setAudioUrl("");
        };
        await audioRef.current.play();
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "处理失败";
      setError(msg);
      setStatus("ready");
    } finally {
      setProcessing(false);
    }
  };

  return (
    <main className="flex min-h-screen flex-col bg-neutral-50">
      {/* Header */}
      <header className="flex items-center justify-between border-b bg-white px-6 py-4">
        <Link href={"/memory-chat/" + id} className="text-neutral-500">
          &larr; 文字聊天
        </Link>
        <h1 className="text-lg font-bold">
          {memory?.name || "加载中..."}
        </h1>
        <Link href="/memories" className="text-neutral-500">
          返回
        </Link>
      </header>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-6">
        {messages.length === 0 && (
          <div className="mt-20 text-center text-neutral-400">
            <p className="text-5xl mb-4">{memory?.photo_url ? (
              <img src={memory.photo_url} alt={memory?.name} className="mx-auto h-24 w-24 rounded-full object-cover" />
            ) : "🎙️"}</p>
            <p className="text-lg">按住下方按钮开始说话</p>
            <p className="text-sm mt-2">像打电话一样，和{memory?.name || "Ta"}聊聊</p>
          </div>
        )}

        {messages.map((msg, i) => (
          <div
            key={i}
            className={"mb-4 flex " + (msg.role === "user" ? "justify-end" : "justify-start")}
          >
            <div
              className={
                "max-w-[80%] rounded-2xl px-5 py-3 " +
                (msg.role === "user"
                  ? "bg-black text-white"
                  : "bg-white text-neutral-800 shadow-sm border")
              }
            >
              <p className="whitespace-pre-wrap text-[15px] leading-relaxed">
                {msg.content}
              </p>
              {msg.role === "assistant" && audioUrl && i === messages.length - 1 && (
                <button
                  onClick={() => audioRef.current?.play()}
                  className="mt-2 text-xs text-blue-500"
                >
                  🔊 重新播放
                </button>
              )}
            </div>
          </div>
        ))}

        {/* Status indicator */}
        {status !== "ready" && (
          <div className="mb-4 flex justify-center">
            <div className="rounded-full bg-white px-4 py-2 text-sm text-neutral-500 shadow-sm border">
              {status === "listening" && "🎙️ 正在聆听..."}
              {status === "thinking" && "✨ " + (memory?.name || "Ta") + " 正在思考..."}
              {status === "speaking" && "🔊 " + (memory?.name || "Ta") + " 正在说话..."}
            </div>
          </div>
        )}

        {error && (
          <div className="mb-4 flex justify-center">
            <div className="rounded-full bg-red-50 px-4 py-2 text-sm text-red-600">
              {error}
            </div>
          </div>
        )}

        <div ref={(el) => { el?.scrollIntoView({ behavior: "smooth" }); }} />
      </div>

      {/* Record button */}
      <div className="border-t bg-white px-6 py-6">
        <div className="mx-auto max-w-md flex flex-col items-center gap-3">
          <button
            onMouseDown={startRecording}
            onMouseUp={stopRecording}
            onTouchStart={startRecording}
            onTouchEnd={stopRecording}
            onMouseLeave={stopRecording}
            disabled={processing}
            className={
              "flex h-20 w-20 items-center justify-center rounded-full transition-all " +
              (recording
                ? "scale-110 bg-red-500 shadow-lg shadow-red-200"
                : processing
                ? "bg-neutral-300 cursor-not-allowed"
                : "bg-black hover:bg-neutral-800 shadow-lg")
            }
          >
            <span className="text-2xl text-white">
              {recording ? "🎙️" : processing ? "⏳" : "🎙️"}
            </span>
          </button>

          <p className="text-xs text-neutral-400">
            {recording ? "松开发送" : processing ? "处理中..." : "按住说话"}
          </p>
        </div>
      </div>

      {/* Hidden audio element */}
      <audio ref={audioRef} className="hidden" />
    </main>
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
