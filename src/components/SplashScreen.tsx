"use client";

import { useEffect, useRef, useCallback } from "react";

/* ============================================================
   忆见 — Apple-grade minimal splash
   Warm void → central presence → dissolve
   No 3D. No particles. No geometry. Pure light.
   ============================================================ */

interface SplashScreenProps { onComplete: () => void; }

export default function SplashScreen({ onComplete }: SplashScreenProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef(0);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const w = canvas.width = window.innerWidth * (window.devicePixelRatio || 1);
    const h = canvas.height = window.innerHeight * (window.devicePixelRatio || 1);
    ctx.scale(window.devicePixelRatio || 1, window.devicePixelRatio || 1);
    const W = window.innerWidth;
    const H = window.innerHeight;

    const start = performance.now();

    const frame = (now: number) => {
      const t = (now - start) / 1000;
      ctx.clearRect(0, 0, W, H);

      // Background: warm dark
      const bgGrad = ctx.createRadialGradient(W/2, H*0.42, 0, W/2, H*0.42, Math.max(W, H)*0.7);
      bgGrad.addColorStop(0, "#1a1410");
      bgGrad.addColorStop(0.5, "#0e0b08");
      bgGrad.addColorStop(1, "#000000");
      ctx.fillStyle = bgGrad;
      ctx.fillRect(0, 0, W, H);

      // Central warm glow — builds over time
      const glowAlpha = Math.min(1, t / 1.2) * 0.35;
      const glowPulse = 1 + Math.sin(t * 1.3) * 0.08;
      const glowR = 120 * glowPulse;
      const glowGrad = ctx.createRadialGradient(W/2, H*0.42, 0, W/2, H*0.42, glowR);
      glowGrad.addColorStop(0, `rgba(255,210,166,${glowAlpha * 0.6})`);
      glowGrad.addColorStop(0.3, `rgba(255,210,166,${glowAlpha * 0.25})`);
      glowGrad.addColorStop(0.7, `rgba(255,180,130,${glowAlpha * 0.06})`);
      glowGrad.addColorStop(1, "rgba(255,210,166,0)");
      ctx.fillStyle = glowGrad;
      ctx.fillRect(0, 0, W, H);

      // "忆见" text — warm, minimal, appears after 0.4s
      const textAlpha = t < 0.4 ? 0 : Math.min(1, (t - 0.4) / 0.6);
      if (textAlpha > 0) {
                const fontSize = Math.min(W * 0.18, 72);
        const fontWeight = 600;
        ctx.font = `${fontWeight} ${fontSize}px "Noto Serif SC", "Songti SC", serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillStyle = `rgba(255,210,166,${textAlpha * 0.9})`;
        ctx.shadowColor = `rgba(255,210,166,${textAlpha * 0.4})`;
        ctx.shadowBlur = 40;
        ctx.fillText("\u5fc6\u89c1", W/2, H*0.42);
        ctx.shadowBlur = 0;
      }

      // Subtle tagline — appears later
      const tagAlpha = t < 0.9 ? 0 : Math.min(1, (t - 0.9) / 0.5);
      if (tagAlpha > 0) {
        ctx.font = `300 13px "Noto Sans SC", system-ui, sans-serif`;
        ctx.fillStyle = `rgba(180,160,140,${tagAlpha * 0.7})`;
        ctx.shadowColor = `rgba(255,210,166,${tagAlpha * 0.15})`;
        ctx.shadowBlur = 20;
        ctx.fillText("\u8ba9\u601d\u5ff5\uff0c\u88ab\u6e29\u67d4\u8bb0\u4f4f", W/2, H*0.42 + 48);
        ctx.shadowBlur = 0;
      }

      if (t < 2.8) {
        rafRef.current = requestAnimationFrame(frame);
      } else {
        // Done — brief hold then callback
        setTimeout(() => onComplete(), 100);
      }
    };

    rafRef.current = requestAnimationFrame(frame);
  }, [onComplete]);

  useEffect(() => {
    draw();
    return () => cancelAnimationFrame(rafRef.current);
  }, [draw]);

  return (
    <canvas
      ref={canvasRef}
      style={{
        position: "fixed", inset: 0, zIndex: 200,
        width: "100vw", height: "100vh",
      }}
    />
  );
}