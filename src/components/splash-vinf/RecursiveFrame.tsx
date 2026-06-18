"use client";
import { motion } from "framer-motion";
import { RecursionState, recurse, MAX_DEPTH } from "../../lib/recursion-types";

interface Props {
  state: RecursionState;
  memoryName: string;
}

/**
 * RecursiveFrame — 渲染自身的组件
 * 每一层都是上一层的缩小、旋转、色相偏移版本
 */
export default function RecursiveFrame({ state, memoryName }: Props) {
  const { depth, scale, rotation, hue, opacity } = state;
  const borderColor = `hsla(${hue}, 60%, 65%, ${opacity * 0.6})`;
  const bgColor = `hsla(${hue}, 40%, 8%, ${opacity * 0.15})`;
  const textColor = `hsla(${hue}, 50%, 75%, ${opacity * 0.5})`;

  // 终止条件
  if (depth >= MAX_DEPTH || opacity < 0.02) {
    return (
      <motion.div
        animate={{ opacity: [0.3, 0.6, 0.3], scale: [0.9, 1, 0.9] }}
        transition={{ duration: 2 + depth * 0.3, repeat: Infinity }}
        style={{
          width: "100%", height: "100%",
          display: "flex", alignItems: "center", justifyContent: "center",
          background: bgColor,
          border: `1px solid ${borderColor}`,
          borderRadius: depth % 3 === 0 ? 4 : depth % 3 === 1 ? 2 : 8,
        }}
      >
        <span style={{ fontSize: Math.max(6, 10 - depth * 0.5), color: textColor, fontFamily: "monospace", letterSpacing: "0.2em" }}>
          {memoryName.slice(0, 4) || "∞"}
        </span>
      </motion.div>
    );
  }

  const child = recurse(state);

  return (
    <motion.div
      animate={{
        rotate: depth % 2 === 0 ? [0, rotation * 0.1] : [rotation * 0.1, 0],
      }}
      transition={{ duration: 8 + depth * 0.5, repeat: Infinity, ease: "linear" }}
      style={{
        width: "100%", height: "100%",
        display: "flex", alignItems: "center", justifyContent: "center",
        background: bgColor,
        border: `1px solid ${borderColor}`,
        borderRadius: depth % 3 === 0 ? 3 : depth % 3 === 1 ? 2 : 6,
        padding: depth === 0 ? 0 : 8,
      }}
    >
      {/* 当前层标签 */}
      {depth > 0 && depth < 5 && (
        <motion.span
          animate={{ opacity: [0.2, 0.5, 0.2] }}
          transition={{ duration: 3 + depth, repeat: Infinity }}
          style={{
            position: "absolute", top: 4, left: 8,
            fontSize: 8, color: textColor, fontFamily: "monospace",
            letterSpacing: "0.15em", pointerEvents: "none",
          }}
        >
          L{depth}
        </motion.span>
      )}

      {/* 递归渲染自身 */}
      <div style={{ width: `${child.scale * 100}%`, height: `${child.scale * 100}%`, position: "relative" }}>
        <RecursiveFrame state={child} memoryName={memoryName} />
      </div>
    </motion.div>
  );
}