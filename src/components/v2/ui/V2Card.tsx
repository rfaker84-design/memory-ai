"use client";
import React from "react";
import { motion } from "framer-motion";
import { V2, r, shadow } from "../../../../styles/v2-emotion-ui";

type Props = {
  children: React.ReactNode;
  pressable?: boolean;
  onClick?: () => void;
  style?: React.CSSProperties;
};

export default function V2Card({ children, pressable, onClick, style }: Props) {
  return (
    <motion.div
      onClick={onClick}
      whileTap={pressable?{scale:0.985}:undefined}
      style={{
        borderRadius:r.lg,
        border:`0.5px solid ${V2.border}`,
        background:V2.surface,
        boxShadow:shadow.card,
        padding:16,
        backdropFilter:"blur(12px)",
        WebkitBackdropFilter:"blur(12px)",
        cursor:pressable?"pointer":"default",
        ...style,
      }}
    >
      {children}
    </motion.div>
  );
}