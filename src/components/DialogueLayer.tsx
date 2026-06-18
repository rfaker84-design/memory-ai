"use client";
import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import type { DialogueTurn } from "../hooks/useActiveMemory";

interface Props {
  history: DialogueTurn[];
  isThinking: boolean;
  memoryName: string;
  onSend: (text: string) => void;
}

export default function DialogueLayer({ history, isThinking, memoryName, onSend }: Props) {
  const [input, setInput] = useState("");

  const handleSubmit = () => {
    if (!input.trim() || isThinking) return;
    onSend(input.trim());
    setInput("");
  };

  return (
    <div className="absolute inset-0 flex flex-col z-20" style={{ pointerEvents: "none" }}>
      {/* ================================================================
          Messages area
          ================================================================ */}
      <div className="flex-1 overflow-y-auto px-6 pt-20 pb-4" style={{ pointerEvents: "auto" }}>
        <div className="mx-auto max-w-md flex flex-col gap-4">
          <AnimatePresence>
            {history.map((turn, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: turn.role === "memory" ? -6 : 8, filter: "blur(2px)" }}
                animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
                transition={{ duration: 0.8, ease: "easeOut" }}
                className={turn.role === "memory" ? "self-start mr-12" : "self-end ml-12"}
              >
                {turn.role === "memory" && (
                  <p className="text-[10px] tracking-[0.12em] mb-1" style={{ color: "rgba(180,170,150,0.25)" }}>
                    {memoryName}
                  </p>
                )}
                <p
                  className="text-[14px] leading-relaxed tracking-[0.04em]"
                  style={{
                    color: turn.role === "memory" ? "rgba(220,210,190,0.75)" : "rgba(180,185,200,0.55)",
                    fontStyle: turn.role === "memory" ? "italic" : "normal",
                    margin: 0,
                  }}
                >
                  {turn.content}
                </p>
              </motion.div>
            ))}
          </AnimatePresence>

          {/* Thinking indicator */}
          {isThinking && (
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }}
              className="self-start mr-12 flex items-center gap-2"
            >
              <p className="text-[10px] tracking-[0.12em]" style={{ color: "rgba(180,170,150,0.2)" }}>
                {memoryName}
              </p>
              <motion.span
                animate={{ opacity: [0.2, 0.5, 0.2] }}
                transition={{ duration: 1.5, repeat: Infinity }}
                className="text-[13px] italic" style={{ color: "rgba(180,170,150,0.3)" }}
              >
                ...
              </motion.span>
            </motion.div>
          )}
        </div>
      </div>

      {/* ================================================================
          Input area
          ================================================================ */}
      <div className="shrink-0 px-6 pb-8" style={{ pointerEvents: "auto" }}>
        <div className="mx-auto max-w-md flex gap-3">
          <input
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter") handleSubmit(); }}
            placeholder="说点什么..."
            className="flex-1 rounded-full px-5 py-3 text-[14px] outline-none transition-all focus:ring-1"
            style={{
              background: "rgba(20,22,40,0.6)", backdropFilter: "blur(12px)",
              border: "0.5px solid rgba(255,255,255,0.06)",
              color: "rgba(200,200,210,0.7)",
              letterSpacing: "0.04em",
            }}
          />
          <button
            onClick={handleSubmit}
            disabled={!input.trim() || isThinking}
            className="rounded-full px-5 py-3 text-[13px] font-light tracking-[0.08em] transition-all disabled:opacity-20"
            style={{
              background: "rgba(200,180,150,0.08)",
              color: "rgba(210,200,180,0.45)",
              border: "0.5px solid rgba(200,180,150,0.08)",
              cursor: input.trim() ? "pointer" : "default",
            }}
          >
            发送
          </button>
        </div>
      </div>
    </div>
  );
}