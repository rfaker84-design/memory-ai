"use client";
import { motion, AnimatePresence } from "framer-motion";
import type { EntityState, EntityMood, MemoryNode } from "../../lib/entity-types";
import { MOOD_VISUALS } from "../../lib/entity-types";

interface Props {
  entity: EntityState;
  mood: EntityMood;
  userActive: boolean;
  intensity: number;
  onDeepInteraction: () => void;
}

export default function EntityResponse({ entity, mood, userActive, intensity, onDeepInteraction }: Props) {
  const v = MOOD_VISUALS[mood];
  const coreMemory = entity.memoryGraph?.coreMemory;
  const strongMemories = entity.memoryGraph?.strongMemories || [];
  const isSleeping = entity.lifecycle === "sleeping" || entity.lifecycle === "dormant";

  // 实体状态文字
  const statusText = isSleeping
    ? "TA 正在沉睡..."
    : mood === "calm" ? "TA 安静地在这里"
    : mood === "warm" ? "TA 感受到了你的到来"
    : mood === "melancholy" ? "TA 沉浸在回忆中"
    : mood === "bright" ? "TA 今天心情很好"
    : mood === "distant" ? "TA 在远方望着你"
    : mood === "curious" ? "TA 注意到了你"
    : "TA 在这里";

  return (
    <div className="absolute inset-0 pointer-events-none">
      {/* 状态指示器 */}
      <motion.div
        animate={{ opacity: intensity * 0.6 }}
        className="absolute top-8 left-0 right-0 text-center z-20"
      >
        <motion.p
          key={mood}
          initial={{ opacity: 0, y: -4 }}
          animate={{ opacity: 0.45, y: 0 }}
          transition={{ duration: 1.5 }}
          style={{
            fontSize: 13,
            color: "rgba(255,255,255,0.45)",
            letterSpacing: "0.12em",
            fontWeight: 300,
          }}
        >
          {statusText}
        </motion.p>
      </motion.div>

      {/* 用户活跃时 — 增强光响应 */}
      <AnimatePresence>
        {userActive && !isSleeping && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: intensity * 0.25 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0"
          >
            <div
              style={{
                position: "absolute", inset: 0,
                background: `radial-gradient(ellipse at 50% 35%, ${v.glowColor}0.3), transparent 55%)`,
                filter: "blur(30px)",
              }}
            />
          </motion.div>
        )}
      </AnimatePresence>

      {/* 核心记忆 — 悬浮文字 */}
      <AnimatePresence>
        {coreMemory && !isSleeping && intensity > 0.5 && (
          <motion.div
            initial={{ opacity: 0, filter: "blur(8px)", y: 8 }}
            animate={{ opacity: 0.35, filter: "blur(0px)", y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 2, delay: 2 }}
            className="absolute top-1/3 left-0 right-0 text-center z-20"
          >
            <p
              style={{
                fontSize: 16,
                fontWeight: 300,
                color: "rgba(255,255,255,0.35)",
                letterSpacing: "0.15em",
                fontStyle: "italic",
                textShadow: `0 0 30px ${v.glowColor}0.15)`,
                padding: "0 48px",
              }}
            >
              &ldquo;{coreMemory}&rdquo;
            </p>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 记忆碎片 */}
      {strongMemories.slice(0, 3).map((mem, i) => (
        <motion.div
          key={mem.id}
          initial={{ opacity: 0, x: -10 }}
          animate={{
            opacity: intensity * mem.strength * 0.3,
            x: 10 * (i + 1),
          }}
          transition={{ duration: 3, delay: 3 + i * 1.5, ease: "easeOut" }}
          className="absolute z-20"
          style={{
            bottom: `${18 + i * 8}%`,
            left: `${15 + i * 8}%`,
            maxWidth: 120,
          }}
        >
          <p
            style={{
              fontSize: 11,
              color: "rgba(255,255,255,0.25)",
              letterSpacing: "0.06em",
              lineHeight: 1.5,
            }}
          >
            {mem.content}
          </p>
        </motion.div>
      ))}

      {/* 关系指标 */}
      {entity.relationship && (
        <motion.div
          animate={{ opacity: 0.2 + entity.relationship.userAttachmentLevel * 0.3 }}
          className="absolute bottom-8 left-0 right-0 text-center z-20"
        >
          <div style={{ display: "flex", justifyContent: "center", gap: 4 }}>
            {Array.from({ length: 5 }, (_, i) => (
              <motion.div
                key={"rl" + i}
                animate={{
                  opacity: i < Math.ceil(entity.relationship.userAttachmentLevel * 5) ? 0.5 : 0.1,
                  scale: i < Math.ceil(entity.relationship.userAttachmentLevel * 5) ? 1 : 0.7,
                }}
                style={{
                  width: 4, height: 4,
                  borderRadius: "50%",
                  background: v.glowColor + "0.6)",
                }}
              />
            ))}
          </div>
        </motion.div>
      )}
    </div>
  );
}