"use client";

import React from "react";
import { motion } from "framer-motion";
import { palette, radius, shadow, motion as m } from "../../../styles/app-store-design-system";

/* =========================================================================
   AppStoreCard — App Store-grade dark glass card
   ========================================================================= */

interface Props {
  children: React.ReactNode;
  onClick?: () => void;
  pressable?: boolean;
  style?: React.CSSProperties;
}

export default function AppStoreCard({ children, onClick, pressable=false, style }: Props) {
  const base: React.CSSProperties = {
    borderRadius:radius.card,border:`0.5px solid ${palette.border}`,
    background:palette.surface,boxShadow:shadow.card,
    backdropFilter:"blur(12px)",WebkitBackdropFilter:"blur(12px)",
    padding:"16px 18px",cursor:pressable||onClick?"pointer":"default",
    transition:"box-shadow 0.2s,border-color 0.2s",
    ...style,
  };
  if (pressable || onClick) {
    return <motion.div whileTap={m.press.whileTap} onClick={onClick} style={base}>{children}</motion.div>;
  }
  return <div style={base}>{children}</div>;
}
