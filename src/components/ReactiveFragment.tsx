"use client";
import { motion } from "framer-motion";

interface Props {
  fragment: { text: string; x: number; y: number; id: number };
  isActive: boolean;
  isDimmed: boolean;
  onHover: (id: number) => void;
  onLeave: () => void;
  onClick: (id: number) => void;
}

export default function ReactiveFragment({ fragment, isActive, isDimmed, onHover, onLeave, onClick }: Props) {
  const opacity = isDimmed ? 0.1 : isActive ? 0.6 : 0.3;
  const scale = isActive ? 1.18 : 1;
  const blur = isDimmed ? 3 : 0;

  return (
    <motion.p
      animate={{
        opacity, scale, filter: `blur(${blur}px)`,
      }}
      transition={{ duration: 0.5, ease: "easeOut" }}
      style={{
        position: "absolute",
        left: `${fragment.x}%`, top: `${fragment.y}%`,
        fontSize: isActive ? 16 : 13,
        fontWeight: isActive ? 350 : 300,
        color: isActive ? "rgba(225,210,185,0.8)" : "rgba(200,185,155,0.4)",
        letterSpacing: "0.07em",
        maxWidth: 220,
        lineHeight: 1.8,
        margin: 0,
        fontStyle: "italic",
        cursor: "pointer",
        zIndex: isActive ? 15 : 0,
        textShadow: isActive ? "0 0 20px rgba(200,170,130,0.3)" : "none",
        transition: "text-shadow 0.4s",
      }}
      onMouseEnter={() => onHover(fragment.id)}
      onMouseLeave={onLeave}
      onClick={() => onClick(fragment.id)}
    >
      {fragment.text}
    </motion.p>
  );
}