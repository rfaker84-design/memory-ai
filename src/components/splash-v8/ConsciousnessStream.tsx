"use client";
import { useRef, useEffect } from "react";
import type { ConsciousnessState, ConsciousnessFrame } from "../../lib/consciousness-types";
import { ConsciousnessStreamEngine } from "../../lib/consciousness-types";

interface Props {
  state: ConsciousnessState;
  phase: number;        // 0-1, boot sequence progress
  userActive: boolean;
}

const W = 800, H = 600;

export default function ConsciousnessStream({ state, phase, userActive }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const frameRef = useRef<ConsciousnessFrame | null>(null);
  const tRef = useRef(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let running = true;

    const tick = () => {
      if (!running) return;
      tRef.current += 0.016; // ~60fps
      const t = tRef.current;

      const frame = ConsciousnessStreamEngine.generateFrame(state, t, W, H);
      frameRef.current = frame;

      const c = state.collapseProgress;
      const expandPhase = Math.min(phase * 2, 1);
      const awarenessFade = phase * state.awarenessLevel;

      ctx.clearRect(0, 0, W, H);

      // --- 背景：噪声场 ---
      const bgGrad = ctx.createRadialGradient(W / 2, H * 0.4, 0, W / 2, H * 0.4, W * 0.7);
      const noiseVal = (frame.backgroundNoise[0] + 1) / 2;
      bgGrad.addColorStop(0, `rgba(${10 + noiseVal * 20},${8 + noiseVal * 15},${25 + noiseVal * 30},1)`);
      bgGrad.addColorStop(0.5, `rgba(${4},${3},${12},1)`);
      bgGrad.addColorStop(1, `rgba(${2},${1},${6},1)`);
      ctx.fillStyle = bgGrad;
      ctx.fillRect(0, 0, W, H);

      // --- 坍缩域 ---
      if (c > 0.01) {
        const collapseGrad = ctx.createRadialGradient(W / 2, H * 0.35, frame.collapseRadius * 0.3, W / 2, H * 0.35, frame.collapseRadius);
        collapseGrad.addColorStop(0, "rgba(0,0,0,0.9)");
        collapseGrad.addColorStop(0.5, "rgba(2,1,8,0.4)");
        collapseGrad.addColorStop(1, "transparent");
        ctx.fillStyle = collapseGrad;
        ctx.fillRect(0, 0, W, H);
      }

      // --- 情绪波可视化 ---
      ctx.beginPath();
      ctx.moveTo(0, H * 0.45);
      for (let x = 0; x < W; x += 2) {
        const waveVal = ConsciousnessStreamEngine.sample(state.emotionWave, t + x * 0.003, state.userSentiment);
        const y = H * 0.45 - waveVal * 40 * expandPhase;
        ctx.lineTo(x, y);
      }
      ctx.strokeStyle = `rgba(140,180,255,${0.08 * expandPhase})`;
      ctx.lineWidth = 1;
      ctx.stroke();

      // 第二谐波
      ctx.beginPath();
      ctx.moveTo(0, H * 0.45);
      for (let x = 0; x < W; x += 2) {
        const waveVal = ConsciousnessStreamEngine.sample(
          { ...state.emotionWave, baseFrequency: state.emotionWave.baseFrequency * 2.3, phase: state.emotionWave.phase + 1.5 },
          t + x * 0.003, state.userSentiment
        );
        const y = H * 0.45 - waveVal * 25 * expandPhase;
        ctx.lineTo(x, y);
      }
      ctx.strokeStyle = `rgba(200,160,255,${0.05 * expandPhase})`;
      ctx.stroke();

      // --- 意识片段 ---
      for (const frag of frame.fragments) {
        const fx = frag.x / 100 * W;
        const fy = frag.y / 100 * H;
        const alpha = frag.opacity * expandPhase * (1 - c * 0.8);

        if (alpha < 0.02) continue;

        // 光晕
        const glowGrad = ctx.createRadialGradient(fx, fy, 0, fx, fy, 40 * frag.scale);
        const [r, g, b] = frag.color;
        glowGrad.addColorStop(0, `rgba(${Math.round(r * 255)},${Math.round(g * 255)},${Math.round(b * 255)},${alpha * 0.3})`);
        glowGrad.addColorStop(1, "transparent");
        ctx.fillStyle = glowGrad;
        ctx.fillRect(fx - 40, fy - 40, 80, 80);

        // 文字
        ctx.save();
        ctx.filter = `blur(${frag.blur * (1 - expandPhase * 0.7)}px)`;
        ctx.fillStyle = `rgba(${Math.round(r * 255)},${Math.round(g * 255)},${Math.round(b * 255)},${alpha})`;
        ctx.font = `${Math.round(11 * frag.scale)}px "PingFang SC","Microsoft YaHei",sans-serif`;
        ctx.textAlign = "center";
        ctx.fillText(frag.content.slice(0, 12), fx, fy);
        ctx.restore();
      }

      // --- 意识层级环 ---
      if (expandPhase > 0.3) {
        for (let ring = 1; ring <= 3; ring++) {
          const ringAlpha = (0.04 + state.awarenessLevel * 0.06) * expandPhase;
          ctx.beginPath();
          ctx.arc(W / 2, H * 0.35, 80 + ring * 60 + Math.sin(t * 0.4 + ring) * 15, 0, Math.PI * 2);
          ctx.strokeStyle = `rgba(130,170,220,${ringAlpha})`;
          ctx.lineWidth = 0.5;
          ctx.stroke();
        }
      }

      // --- 用户同步指示器 ---
      if (userActive && phase > 0.7 && c < 0.7) {
        const syncPulse = Math.sin(t * 3) * 0.5 + 0.5;
        const syncGrad = ctx.createRadialGradient(W / 2, H * 0.35, 0, W / 2, H * 0.35, 250);
        syncGrad.addColorStop(0, `rgba(180,210,255,${0.1 * syncPulse})`);
        syncGrad.addColorStop(1, "transparent");
        ctx.fillStyle = syncGrad;
        ctx.fillRect(0, 0, W, H);
      }

      // --- Vignette ---
      const vigGrad = ctx.createRadialGradient(W / 2, H * 0.35, W * 0.3, W / 2, H * 0.35, W * 0.7);
      vigGrad.addColorStop(0, "transparent");
      vigGrad.addColorStop(1, "rgba(2,1,8,0.6)");
      ctx.fillStyle = vigGrad;
      ctx.fillRect(0, 0, W, H);

      requestAnimationFrame(tick);
    };

    requestAnimationFrame(tick);
    return () => { running = false; };
  }, [state, phase, userActive]);

  return (
    <canvas
      ref={canvasRef}
      width={W}
      height={H}
      style={{ width: "100%", height: "100%" }}
    />
  );
}