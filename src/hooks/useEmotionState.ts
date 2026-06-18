"use client";
import { useState, useRef, useEffect, useCallback } from "react";

export type EmotionStateName = "calm" | "warm" | "unstable" | "deep" | "nostalgic";

export interface EmotionState {
  name: EmotionStateName;
  intensity: number;       // 0-1
  stability: number;       // 0-1
  hue: number;             // dominant color hue
  pulseSpeed: number;      // breathing cycle speed multiplier
}

const STATE_PRESETS: Record<EmotionStateName, Omit<EmotionState, "intensity" | "stability">> = {
  calm:      { name: "calm",      hue: 210, pulseSpeed: 1.0 },
  warm:      { name: "warm",      hue: 35,  pulseSpeed: 1.3 },
  unstable:  { name: "unstable",  hue: 280, pulseSpeed: 2.0 },
  deep:      { name: "deep",      hue: 240, pulseSpeed: 0.6 },
  nostalgic: { name: "nostalgic", hue: 30,  pulseSpeed: 0.8 },
};

export default function useEmotionState() {
  const [state, setState] = useState<EmotionState>({
    ...STATE_PRESETS.calm, intensity: 0.4, stability: 0.8,
  });
  const dwellStart = useRef(0);
  const mouseLastMove = useRef(Date.now());
  const mouseSpeed = useRef(0);
  const interactionCount = useRef(0);
  const rafRef = useRef(0);

  // 鼠标追踪
  useEffect(() => {
    let lastX = 0, lastY = 0;
    const onMove = (e: MouseEvent) => {
      const now = Date.now();
      const dt = Math.max(now - mouseLastMove.current, 1);
      const dx = e.clientX - lastX;
      const dy = e.clientY - lastY;
      mouseSpeed.current = Math.sqrt(dx * dx + dy * dy) / dt;
      lastX = e.clientX; lastY = e.clientY;
      mouseLastMove.current = now;
    };
    window.addEventListener("mousemove", onMove, { passive: true });
    return () => window.removeEventListener("mousemove", onMove);
  }, []);

  // RAF 情绪状态更新
  useEffect(() => {
    let running = true;
    const tick = () => {
      if (!running) return;
      const idleTime = (Date.now() - mouseLastMove.current) / 1000;
      const speed = mouseSpeed.current;

      setState(prev => {
        let name: EmotionStateName = prev.name;
        let intensity = prev.intensity;
        let stability = prev.stability;

        if (idleTime > 10) {
          // 长时间静止 → calm
          name = "calm";
          intensity = Math.max(0.2, intensity - 0.003);
          stability = Math.min(1, stability + 0.002);
        } else if (speed > 2) {
          // 快速移动 → unstable
          name = "unstable";
          intensity = Math.min(1, intensity + 0.01);
          stability = Math.max(0.2, stability - 0.005);
        } else if (interactionCount.current > 5) {
          // 高交互 → warm
          name = "warm";
          intensity = Math.min(1, intensity + 0.005);
          stability = Math.max(0.4, stability - 0.001);
        } else if (idleTime > 5) {
          // 中等静止 → deep
          name = "deep";
          intensity = Math.min(0.8, intensity + 0.002);
          stability = Math.min(1, stability + 0.001);
        }

        // 渐退交互计数
        interactionCount.current = Math.max(0, interactionCount.current - 0.01);

        const preset = STATE_PRESETS[name];
        return { ...preset, intensity, stability };
      });

      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => { running = false; cancelAnimationFrame(rafRef.current); };
  }, []);

  // 外部触发
  const onDwell = useCallback(() => { interactionCount.current += 0.5; }, []);
  const onClickFragment = useCallback(() => { interactionCount.current += 1; }, []);
  const onIdle = useCallback(() => { mouseLastMove.current = 0; }, []); // force idle

  return { state, onDwell, onClickFragment, onIdle };
}