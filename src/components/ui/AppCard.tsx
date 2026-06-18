"use client";

import React from "react";
import { motion } from "framer-motion";
import { colors, radius, shadows, motion as motionPresets } from "../../../styles/design-tokens";

/* =========================================================================
   AppCard — Dark glass card
   Subtle border + soft shadow + optional press interaction
   ========================================================================= */

interface AppCardProps {
  children: React.ReactNode;
  onClick?: () => void;
  pressable?: boolean;
  style?: React.CSSProperties;
}

export default function AppCard({
  children,
  onClick,
  pressable = false,
  style,
}: AppCardProps) {
  const baseStyle: React.CSSProperties = {
    borderRadius: radius.card,
    border: `0.5px solid ${colors.border}`,
    background: colors.surface,
    boxShadow: shadows.card,
    backdropFilter: "blur(12px)",
    WebkitBackdropFilter: "blur(12px)",
    padding: "16px 18px",
    cursor: pressable || onClick ? "pointer" : "default",
    transition: "box-shadow 0.2s, border-color 0.2s",
    ...style,
  };

  if (pressable || onClick) {
    return (
      <motion.div
        whileTap={motionPresets.pressDown.whileTap}
        onClick={onClick}
        style={baseStyle}
      >
        {children}
      </motion.div>
    );
  }

  return <div style={baseStyle}>{children}</div>;
}
