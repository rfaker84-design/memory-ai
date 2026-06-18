"use client";
import React from "react";
import { motion } from "framer-motion";
import { V2, r, shadow, motion as m } from "../../../../styles/v2-emotion-ui";

type Props = {
  variant?: "primary" | "secondary";
  onClick?: () => void;
  children: React.ReactNode;
  style?: React.CSSProperties;
  loading?: boolean;
};

export default function V2Button({ variant="primary", onClick, children, style, loading }: Props) {
  const isPrimary = variant === "primary";
  return (
    <motion.button
      onClick={onClick}
      whileTap={m.press.whileTap}
      disabled={loading}
      style={{
        width:"100%",minHeight:50,borderRadius:r.lg,
        border:`0.5px solid ${isPrimary?V2.borderGlow:V2.border}`,
        background:isPrimary?V2.primarySoft:"rgba(255,255,255,0.025)",
        color:isPrimary?V2.primary:V2.muted,
        fontSize:15,fontWeight:600,letterSpacing:"0.04em",
        cursor:loading?"wait":"pointer",
        boxShadow:isPrimary?shadow.glow:"none",
        opacity:loading?0.6:1,
        display:"flex",alignItems:"center",justifyContent:"center",
        ...style,
      }}
    >
      {loading ? (
        <div style={{width:18,height:18,borderRadius:"50%",border:`2px solid ${V2.border}`,borderTopColor:V2.primary,animation:"spin-ring 0.7s linear infinite"}}/>
      ) : children}
    </motion.button>
  );
}