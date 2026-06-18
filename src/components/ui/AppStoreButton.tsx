"use client";

import React from "react";
import { motion } from "framer-motion";
import { palette, radius, shadow, motion as m } from "../../../styles/app-store-design-system";

/* =========================================================================
   AppStoreButton — App Store-grade button
   Variants: primary | secondary | ghost
   ========================================================================= */

interface Props {
  children: React.ReactNode;
  onClick?: () => void;
  variant?: "primary" | "secondary" | "ghost";
  loading?: boolean;
  disabled?: boolean;
  fullWidth?: boolean;
  style?: React.CSSProperties;
}

export default function AppStoreButton({ children, onClick, variant="primary", loading=false, disabled=false, fullWidth=false, style }: Props) {
  const isDisabled = disabled || loading;
  const v = {
    primary:   { border:`0.5px solid ${palette.borderPrimary}`, background:palette.primarySoft, color:palette.primary, boxShadow:shadow.elevated },
    secondary: { border:`0.5px solid ${palette.border}`,       background:"rgba(255,255,255,0.025)", color:palette.textSecondary },
    ghost:     { border:"0.5px solid transparent",              background:"transparent",              color:palette.textMuted },
  }[variant];

  return (
    <motion.button
      whileTap={!isDisabled ? m.press.whileTap : undefined}
      onClick={onClick}
      disabled={isDisabled}
      style={{
        display:"inline-flex",alignItems:"center",justifyContent:"center",gap:8,
        width:fullWidth?"100%":"auto",minHeight:48,padding:"0 26px",
        borderRadius:radius.button,fontSize:15,fontWeight:600,
        letterSpacing:"0.03em",cursor:isDisabled?"not-allowed":"pointer",
        opacity:isDisabled?0.4:1,transition:"opacity 0.2s,background 0.2s",
        ...v,...style,
      }}
    >
      {loading && <div style={{width:16,height:16,borderRadius:"50%",border:`2px solid ${palette.border}`,borderTopColor:variant==="primary"?palette.primary:palette.textMuted,animation:"spin-ring 0.7s linear infinite",flexShrink:0}}/>}
      {children}
    </motion.button>
  );
}
