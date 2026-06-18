"use client";
import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useRouter } from "next/navigation";
import useDigitalEntity from "../../hooks/useDigitalEntity";
import useLightField from "../../hooks/useLightField";
import useHaptics from "../../hooks/useHaptics";
import EntityPresence from "./EntityPresence";
import EntityResponse from "./EntityResponse";
import type { RealityLayer, EntityState, MemoryNode } from "../../lib/entity-types";

interface Props {
  memoryId: string;
  memoryName: string;
  onExit?: () => void;
}

export default function LivingMemoryScreen({ memoryId, memoryName, onExit }: Props) {
  const router = useRouter();
  const h = useHaptics();
  const lf = useLightField();
  const { entity, loading, mood, visuals, onUserActive, onDeepInteraction } = useDigitalEntity({ memoryId, memoryName });

  const [layer, setLayer] = useState<RealityLayer>("memory");
  const [transitionProgress, setTransitionProgress] = useState(0);
  const [userActive, setUserActive] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const idleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const enteredRef = useRef(false);

  const intensity = entity?.presenceIntensity ?? 0.6;

  // 处理用户交互
  const handleInteraction = useCallback(() => {
    setUserActive(true);
    onUserActive();
    if (idleTimer.current) clearTimeout(idleTimer.current);
    idleTimer.current = setTimeout(() => setUserActive(false), 6000);
  }, [onUserActive]);

  // 滚轮切换层级
  const handleWheel = useCallback((e: React.WheelEvent) => {
    handleInteraction();
    const layers: RealityLayer[] = ["memory", "dream", "dialogue"];
    const idx = layers.indexOf(layer);
    if (e.deltaY > 40 && idx < 2) {
      setLayer(layers[idx + 1]);
    } else if (e.deltaY < -40 && idx > 0) {
      setLayer(layers[idx - 1]);
    }
  }, [layer, handleInteraction]);

  // 层级切换动画
  useEffect(() => {
    setTransitionProgress(0);
    const start = performance.now();
    const duration = 800;
    const tick = () => {
      const p = Math.min((performance.now() - start) / duration, 1);
      setTransitionProgress(p);
      if (p < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }, [layer]);

  // 进入聊天
  const handleEnterChat = () => {
    if (enteredRef.current) return;
    enteredRef.current = true;
    h.onEnter();
    onDeepInteraction();
    router.push("/memory-chat/" + memoryId);
  };

  // 回到记忆详情
  const handleBack = () => {
    if (enteredRef.current) return;
    enteredRef.current = true;
    h.onEnter();
    if (onExit) onExit();
    else router.push("/memories/" + memoryId);
  };

  const layerYOffset = useMemo(() => {
    const offsets: Record<RealityLayer, number> = { memory: 0, dream: -100, dialogue: -200 };
    const targets: Record<RealityLayer, number> = { memory: 0, dream: -100, dialogue: -200 };
    const current = offsets[layer];
    // lerp
    return current;
  }, [layer, transitionProgress]);

  const layerLabels: Record<RealityLayer, string> = {
    memory: "现实记忆",
    dream: "情绪梦境",
    dialogue: "对话空间",
  };

  if (loading) {
    return (
      <div className="fixed inset-0 z-[9999] flex items-center justify-center" style={{ background: "#020208" }}>
        <motion.p
          animate={{ opacity: [0.2, 0.5, 0.2] }}
          transition={{ duration: 2.5, repeat: Infinity }}
          style={{ fontSize: 14, color: "rgba(255,255,255,0.3)", letterSpacing: "0.15em" }}
        >
          正在唤醒数字生命...
        </motion.p>
      </div>
    );
  }

  if (!entity) return null;

  return (
    <main
      ref={containerRef}
      className="fixed inset-0 overflow-hidden"
      style={{ background: visuals.bgColor, zIndex: 9999, cursor: "default" }}
      onClick={handleInteraction}
      onMouseMove={handleInteraction}
      onTouchStart={handleInteraction}
      onWheel={handleWheel}
    >
      {/* 三层内容容器 */}
      <motion.div
        animate={{ y: layerYOffset + "%" }}
        transition={{ duration: 1, ease: [0.32, 0.72, 0, 1] }}
        style={{ position: "absolute", inset: 0 }}
      >
        {/* Layer 1: 现实记忆 */}
        <div style={{ position: "absolute", inset: 0, top: 0 }}>
          <EntityPresence visuals={visuals} mood={mood} intensity={intensity} active={true} />
          <EntityResponse entity={entity} mood={mood} userActive={userActive} intensity={intensity} onDeepInteraction={onDeepInteraction} />

          {/* 记忆节点展示 */}
          <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
            <motion.h2
              animate={{ opacity: 0.6 * intensity, y: 0 }}
              initial={{ opacity: 0, y: 16 }}
              transition={{ duration: 1.5 }}
              style={{ fontSize: 24, fontWeight: 300, color: "rgba(255,255,255,0.6)", letterSpacing: "0.2em", marginBottom: 8 }}
            >
              {entity.memoryName}
            </motion.h2>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, justifyContent: "center", maxWidth: "80%", marginTop: 16 }}>
              {entity.memoryGraph?.strongMemories?.slice(0, 5).map((m: MemoryNode) => (
                <motion.span
                  key={m.id}
                  animate={{ opacity: m.strength * intensity * 0.5 }}
                  style={{
                    fontSize: 12, color: "rgba(255,255,255,0.35)", letterSpacing: "0.06em",
                    padding: "4px 10px", borderRadius: 12,
                    border: `1px solid ${visuals.glowColor}0.1)`,
                    background: `${visuals.glowColor}0.04)`,
                  }}
                >
                  {m.content}
                </motion.span>
              ))}
            </div>
          </div>
        </div>

        {/* Layer 2: 情绪梦境 */}
        <div style={{ position: "absolute", inset: 0, top: "100%" }}>
          <div
            style={{
              position: "absolute", inset: 0,
              background: `radial-gradient(ellipse at 50% 40%, ${visuals.glowColor}0.1), ${visuals.bgColor})`,
              filter: `blur(${visuals.blur * 2}px)`,
              opacity: 0.8,
            }}
          />
          <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
            <motion.p
              animate={{ opacity: [0.2, 0.5, 0.2] }}
              transition={{ duration: 4, repeat: Infinity }}
              style={{ fontSize: 15, color: "rgba(255,255,255,0.35)", letterSpacing: "0.2em" }}
            >
              {entity.lifecycle === "sleeping" ? "TA在梦中..." : "记忆如光，缓缓流动"}
            </motion.p>
          </div>
        </div>

        {/* Layer 3: 对话空间 */}
        <div style={{ position: "absolute", inset: 0, top: "200%" }}>
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-6">
            <motion.button
              whileHover={{ scale: 1.04, boxShadow: `0 0 40px ${visuals.glowColor}0.3)` }}
              whileTap={{ scale: 0.97 }}
              onClick={handleEnterChat}
              style={{
                padding: "14px 40px",
                borderRadius: 28,
                border: `1px solid ${visuals.glowColor}0.3)`,
                background: `linear-gradient(135deg, ${visuals.glowColor}0.12), transparent)`,
                color: "rgba(255,255,255,0.8)",
                fontSize: 16,
                fontWeight: 400,
                letterSpacing: "0.12em",
                cursor: "pointer",
                backdropFilter: "blur(12px)",
              }}
            >
              与 TA 对话
            </motion.button>
            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.97 }}
              onClick={handleBack}
              style={{
                padding: "10px 32px",
                borderRadius: 24,
                border: "1px solid rgba(255,255,255,0.1)",
                background: "transparent",
                color: "rgba(255,255,255,0.35)",
                fontSize: 14,
                fontWeight: 300,
                letterSpacing: "0.08em",
                cursor: "pointer",
              }}
            >
              返回记忆
            </motion.button>
          </div>
        </div>
      </motion.div>

      {/* 层级指示器 */}
      <div className="absolute right-6 top-1/2 -translate-y-1/2 flex flex-col gap-3 z-30">
        {(["memory", "dream", "dialogue"] as RealityLayer[]).map((l) => (
          <motion.button
            key={l}
            onClick={(e) => { e.stopPropagation(); setLayer(l); handleInteraction(); }}
            animate={{
              scale: layer === l ? 1.3 : 0.7,
              opacity: layer === l ? 0.8 : 0.2,
            }}
            style={{
              width: 8, height: 8,
              borderRadius: "50%",
              background: layer === l ? visuals.glowColor + "0.8)" : "rgba(255,255,255,0.2)",
              boxShadow: layer === l ? `0 0 12px ${visuals.glowColor}0.4)` : "none",
              border: "none",
              cursor: "pointer",
              transition: "all 0.4s ease",
            }}
            title={layerLabels[l]}
          />
        ))}
      </div>

      {/* 层级标签 */}
      <motion.p
        animate={{ opacity: 0.3 }}
        className="absolute bottom-6 left-0 right-0 text-center z-20 pointer-events-none"
        style={{ fontSize: 11, color: "rgba(255,255,255,0.3)", letterSpacing: "0.15em" }}
      >
        {layerLabels[layer]} · 滚动切换层级
      </motion.p>
    </main>
  );
}