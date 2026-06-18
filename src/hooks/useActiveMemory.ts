"use client";
import { useState, useRef, useCallback, useEffect } from "react";

export type MemoryTone = "warm" | "gentle" | "nostalgic" | "light" | "soft" | "playful";
export type MemoryEmotion = "warm" | "soft" | "nostalgic" | "playful" | "calm";

export interface MemoryState {
  tone: MemoryTone;
  emotion: MemoryEmotion;
  attachmentLevel: number;   // 0-1
  responseDepth: number;     // 0-1
  initiativeCooldown: number; // ms remaining
}

export interface DialogueTurn {
  role: "memory" | "user";
  content: string;
  emotion?: string;
  timestamp: number;
}

export default function useActiveMemory(name: string) {
  const [state, setState] = useState<MemoryState>({
    tone: "gentle", emotion: "calm", attachmentLevel: 0.5, responseDepth: 0.5, initiativeCooldown: 0,
  });
  const [history, setHistory] = useState<DialogueTurn[]>([]);
  const [openingLine, setOpeningLine] = useState("");
  const [openingTone, setOpeningTone] = useState<MemoryTone>("gentle");
  const [isThinking, setIsThinking] = useState(false);
  const hasOpened = useRef(false);

  // 获取开场白
  const fetchOpening = useCallback(async (relationship: string | null, lifeStory: string | null) => {
    if (hasOpened.current) return;
    hasOpened.current = true;

    try {
      const res = await fetch("/api/memory-opening", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, relationship, life_story: lifeStory?.slice(0, 300) }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.line) {
          setOpeningLine(data.line);
          setOpeningTone(data.tone || "gentle");
          setHistory([{ role: "memory", content: data.line, emotion: data.tone, timestamp: Date.now() }]);
          return;
        }
      }
    } catch { /* fallback */ }
    setOpeningLine("你来了。");
    setHistory([{ role: "memory", content: "你来了。", emotion: "gentle", timestamp: Date.now() }]);
  }, [name]);

  // 用户发送消息 → memory 回应
  const sendMessage = useCallback(async (
    userInput: string, relationship: string | null, lifeStory: string | null,
  ) => {
    if (!userInput.trim()) return null;
    setIsThinking(true);

    const userTurn: DialogueTurn = { role: "user", content: userInput, timestamp: Date.now() };
    const updatedHistory = [...history, userTurn];
    setHistory(updatedHistory);

    try {
      const res = await fetch("/api/memory-dialogue", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name, relationship, life_story: lifeStory?.slice(0, 300),
          history: updatedHistory.slice(-6), user_input: userInput,
          emotional_state: state.emotion,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.reply) {
          const memTurn: DialogueTurn = { role: "memory", content: data.reply, emotion: data.emotion, timestamp: Date.now() };
          setHistory(prev => [...prev, memTurn]);
          setState(prev => ({
            ...prev,
            emotion: data.emotion || prev.emotion,
            responseDepth: data.depth === "deep" ? Math.min(1, prev.responseDepth + 0.1) : prev.responseDepth,
            attachmentLevel: Math.min(1, prev.attachmentLevel + 0.02),
          }));
          setIsThinking(false);
          return memTurn;
        }
      }
    } catch { /* ignore */ }

    setIsThinking(false);
    return null;
  }, [name, history, state.emotion]);

  // 记忆主动发起（每 25-35s，最多触发 3 次）
  const initiativeCount = useRef(0);
  useEffect(() => {
    if (!hasOpened.current || initiativeCount.current >= 3) return;
    const delay = 25000 + Math.random() * 10000;
    const timer = setTimeout(() => {
      initiativeCount.current++;
      const initiative = pickInitiative(name, history.length);
      if (initiative) {
        const turn: DialogueTurn = { role: "memory", content: initiative, emotion: "nostalgic", timestamp: Date.now() };
        setHistory(prev => [...prev, turn]);
      }
    }, delay);
    return () => clearTimeout(timer);
  }, [name, history.length]);

  return { state, history, openingLine, openingTone, isThinking, fetchOpening, sendMessage };
}

const INITIATIVES = [
  "我突然想起一件事，想跟你说。",
  "你记得那次吗？",
  "最近你还好吗？",
  "我常常想起我们在一起的时候。",
  "你知道吗，有些记忆会自己跑出来。",
];

function pickInitiative(name: string, turnCount: number): string {
  return INITIATIVES[turnCount % INITIATIVES.length];
}