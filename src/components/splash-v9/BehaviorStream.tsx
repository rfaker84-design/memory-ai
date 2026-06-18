"use client";
import { useRef, useEffect } from "react";
import type { ContinuityState, BehaviorFrame } from "../../lib/continuity-types";
import { noise } from "../../lib/continuity-types";

interface Props {
  state: ContinuityState;
  phase: number;
}

const W = 800, H = 600;

export default function BehaviorStream({ state, phase }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const tRef = useRef(0);
  const historyRef = useRef<number[][]>([]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let running = true;
    const tick = () => {
      if (!running) return;
      tRef.current += 0.016;
      const t = tRef.current;
      const v = state.behavioralVector.dimensions;

      // 降维投影 (PCA-like: 前2个主成分)
      const px = v[0] * 0.3 + v[1] * 0.2 + v[3] * 0.15 + Math.sin(t * 0.3) * 0.1;
      const py = v[2] * 0.25 + v[5] * 0.2 + v[9] * 0.2 + Math.cos(t * 0.4) * 0.1;

      // 连续性脉冲
      const continuityPulse = state.continuityScore * (0.8 + 0.2 * Math.sin(t * 0.5));

      // 信号强度
      const signalStrength = phase * continuityPulse;

      // 存储轨迹
      historyRef.current.push([px, py]);
      if (historyRef.current.length > 200) historyRef.current.shift();

      ctx.clearRect(0, 0, W, H);

      // 背景
      ctx.fillStyle = "#010308";
      ctx.fillRect(0, 0, W, H);

      // 网格
      ctx.strokeStyle = "rgba(40,60,100,0.08)";
      ctx.lineWidth = 0.5;
      for (let gx = 0; gx < W; gx += 40) { ctx.beginPath(); ctx.moveTo(gx, 0); ctx.lineTo(gx, H); ctx.stroke(); }
      for (let gy = 0; gy < H; gy += 40) { ctx.beginPath(); ctx.moveTo(0, gy); ctx.lineTo(W, gy); ctx.stroke(); }

      // 行为轨迹
      if (historyRef.current.length > 1) {
        ctx.beginPath();
        const hist = historyRef.current;
        for (let i = 0; i < hist.length; i++) {
          const hx = W * 0.2 + hist[i][0] * W * 0.6;
          const hy = H * 0.3 + hist[i][1] * H * 0.5;
          if (i === 0) ctx.moveTo(hx, hy);
          else ctx.lineTo(hx, hy);
        }
        ctx.strokeStyle = `rgba(140,180,255,${0.3 * signalStrength})`;
        ctx.lineWidth = 1.5;
        ctx.stroke();

        // 当前点
        const cx = W * 0.2 + px * W * 0.6;
        const cy = H * 0.3 + py * H * 0.5;
        const pulseGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, 25);
        pulseGrad.addColorStop(0, `rgba(180,220,255,${0.8 * signalStrength})`);
        pulseGrad.addColorStop(0.3, `rgba(140,180,255,${0.3 * signalStrength})`);
        pulseGrad.addColorStop(1, "transparent");
        ctx.fillStyle = pulseGrad;
        ctx.fillRect(cx - 30, cy - 30, 60, 60);
      }

      // 决策模式节点
      const patterns = state.decisionPatterns;
      for (let i = 0; i < Math.min(patterns.length, 6); i++) {
        const p = patterns[i];
        const angle = (2 * Math.PI * i) / Math.min(patterns.length, 6) + t * 0.1;
        const r = 120 + noise(t * 0.3 + i) * 30;
        const nx = W / 2 + Math.cos(angle) * r;
        const ny = H * 0.55 + Math.sin(angle) * r * 0.6;

        const alpha = p.probability * signalStrength * 0.6;
        ctx.beginPath();
        ctx.arc(nx, ny, 3 + p.probability * 8, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(160,200,255,${alpha})`;
        ctx.fill();

        // 连线到中心
        ctx.beginPath();
        ctx.moveTo(nx, ny);
        ctx.lineTo(W / 2, H * 0.45);
        ctx.strokeStyle = `rgba(100,140,200,${alpha * 0.4})`;
        ctx.lineWidth = 0.5;
        ctx.stroke();

        // 标签
        if (phase > 0.5) {
          ctx.fillStyle = `rgba(200,220,255,${alpha * 0.8})`;
          ctx.font = '9px "Courier New", monospace';
          ctx.textAlign = "center";
          ctx.fillText(p.action.slice(0, 10), nx, ny - 12);
        }
      }

      // --- 右侧数据面板 ---
      if (phase > 0.4) {
        const panelX = W - 160;
        ctx.fillStyle = "rgba(20,30,50,0.6)";
        ctx.fillRect(panelX, 20, 145, H - 40);
        ctx.strokeStyle = "rgba(80,120,180,0.3)";
        ctx.lineWidth = 0.5;
        ctx.strokeRect(panelX, 20, 145, H - 40);

        const lines = [
          `CONTINUITY: ${(state.continuityScore * 100).toFixed(0)}%`,
          `CONFIDENCE: ${(state.predictionConfidence * 100).toFixed(0)}%`,
          `SAMPLES: ${state.sampleCount}`,
          `STABILITY: ${(state.behavioralVector.stabilityIndex * 100).toFixed(0)}%`,
          `PATTERNS: ${state.decisionPatterns.length}`,
          `DYNAMICS: ${state.emotionalDynamics.length}`,
        ];

        ctx.fillStyle = "rgba(160,200,240,0.6)";
        ctx.font = '10px "Courier New", monospace';
        ctx.textAlign = "left";
        for (let i = 0; i < lines.length; i++) {
          ctx.fillText(lines[i], panelX + 10, 50 + i * 24);
        }

        // 行为向量条形图
        ctx.fillStyle = "rgba(120,160,200,0.5)";
        ctx.font = '8px "Courier New", monospace';
        for (let i = 0; i < 6; i++) {
          const barW = v[i] * 50;
          ctx.fillRect(panelX + 10, 195 + i * 16, barW, 8);
          ctx.fillStyle = "rgba(180,210,240,0.5)";
          ctx.fillText(`${(v[i] * 100).toFixed(0)}`, panelX + 14 + barW, 203 + i * 16);
          ctx.fillStyle = "rgba(120,160,200,0.5)";
        }
      }

      // 标题
      ctx.fillStyle = `rgba(140,180,220,${0.4 * phase})`;
      ctx.font = '11px "Courier New", monospace';
      ctx.textAlign = "left";
      ctx.fillText("MIND CONTINUITY SIMULATION v9", 20, 30);

      // 底部状态
      ctx.fillStyle = `rgba(120,150,180,${0.3 * phase})`;
      ctx.font = '9px "Courier New", monospace';
      ctx.textAlign = "center";
      ctx.fillText(
        `SIGNAL: ${(signalStrength * 100).toFixed(0)}% | CONTINUITY PULSE: ${(continuityPulse * 100).toFixed(0)}%`,
        W / 2, H - 16
      );

      requestAnimationFrame(tick);
    };

    requestAnimationFrame(tick);
    return () => { running = false; };
  }, [state, phase]);

  return <canvas ref={canvasRef} width={W} height={H} style={{ width: "100%", height: "100%" }} />;
}