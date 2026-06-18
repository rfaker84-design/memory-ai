"use client";
import { useRef, useCallback, useState } from "react";

export interface EmotionLayer {
  userId: string;
  attachment: number;
  curiosity: number;
  sadness: number;
  dominant: string;
  intensity: number;
}

interface EmotionOverlayOptions {
  phone: string;
  initialBlended?: EmotionLayer;
}

export default function useEmotionOverlay({ phone, initialBlended }: EmotionOverlayOptions) {
  const [blended, setBlended] = useState<EmotionLayer>(
    initialBlended || { userId: phone, attachment: 0.5, curiosity: 0.5, sadness: 0.3, dominant: "peaceful", intensity: 0.5 }
  );
  const [layers, setLayers] = useState<EmotionLayer[]>([]);
  const pendingRef = useRef<Partial<EmotionLayer>>({});
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 本地情绪更新 + 防抖同步到服务端
  const updateLocal = useCallback((partial: Partial<EmotionLayer>) => {
    pendingRef.current = { ...pendingRef.current, ...partial };
    setBlended(prev => {
      const next: EmotionLayer = {
        ...prev,
        attachment: Math.max(0, Math.min(1, (partial.attachment ?? prev.attachment))),
        curiosity: Math.max(0, Math.min(1, (partial.curiosity ?? prev.curiosity))),
        sadness: Math.max(0, Math.min(1, (partial.sadness ?? prev.sadness))),
        dominant: partial.dominant || prev.dominant,
        intensity: partial.intensity ?? prev.intensity,
      };
      // 计算 intensity 为各维度均方根
      next.intensity = Math.sqrt(
        (next.attachment ** 2 + next.curiosity ** 2 + next.sadness ** 2) / 3
      );
      return next;
    });

    // 防抖同步
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      const p = pendingRef.current;
      pendingRef.current = {};
      fetch("/api/memory-multi-universe", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone, emotion: p }),
      }).catch(() => {});
    }, 2000);
  }, [phone]);

  // hover 时触发情绪变化
  const onHoverMemory = useCallback((memoryId: string | null) => {
    if (memoryId) {
      updateLocal({ curiosity: 0.7, attachment: 0.6, dominant: "warm" });
    } else {
      updateLocal({ curiosity: 0.45, attachment: 0.45, dominant: "peaceful" });
    }
  }, [updateLocal]);

  // click 时触发情绪共鸣
  const onClickMemory = useCallback((memoryId: string) => {
    updateLocal({ attachment: 0.85, intensity: 0.8, dominant: "warm" });
    // 通知服务端
    fetch("/api/memory-multi-universe", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone, memoryId, action: "interact" }),
    }).catch(() => {});
  }, [phone, updateLocal]);

  // 情绪反应
  const reactToMemory = useCallback((memoryId: string, emotion: string) => {
    updateLocal({ dominant: emotion, intensity: 0.7 });
    fetch("/api/memory-multi-universe", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone, memoryId, action: "react", emotion: { dominant: emotion } }),
    }).catch(() => {});
  }, [phone, updateLocal]);

  // 衰减：长时间无交互 → 情绪回落
  const decay = useCallback(() => {
    updateLocal({
      attachment: 0.4,
      curiosity: 0.4,
      sadness: 0.25,
      intensity: 0.35,
      dominant: "peaceful",
    });
  }, [updateLocal]);

  return { blended, layers, onHoverMemory, onClickMemory, reactToMemory, decay, updateLocal };
}