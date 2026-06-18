"use client";

import React from "react";
import { motion } from "framer-motion";
import { colors, radius, shadows, motion as motionPresets } from "../../../styles/design-tokens";

/* =========================================================================
   AppButton — Apple-style button
   Variants: primary | secondary | ghost
   States: normal | loading | disabled
   Press: scale 0.97
   ========================================================================= */

interface AppButtonProps {
  children: React.ReactNode;
  onClick?: () => void;
  variant?: "primary" | "secondary" | "ghost";
  loading?: boolean;
  disabled?: boolean;
  fullWidth?: boolean;
  style?: React.CSSProperties;
}

export default function AppButton({
  children,
  onClick,
  variant = "primary",
  loading = false,
  disabled = false,
  fullWidth = false,
  style,
}: AppButtonProps) {
  const isDisabled = disabled || loading;

  const variantStyles: Record<string, React.CSSProperties> = {
    primary: {
      border: `0.5px solid ${colors.borderPrimary}`,
      background: colors.primarySoft,
      color: colors.primary,
      boxShadow: shadows.button,
    },
    secondary: {
      border: `0.5px solid ${colors.border}`,
      background: "rgba(255,255,255,0.03)",
      color: colors.textSecondary,
      boxShadow: "none",
    },
    ghost: {
      border: "0.5px solid transparent",
      background: "transparent",
      color: colors.textMuted,
      boxShadow: "none",
    },
  };

  const vs = variantStyles[variant];

  return (
    <motion.button
      whileTap={!isDisabled ? motionPresets.pressDown.whileTap : undefined}
      onClick={onClick}
      disabled={isDisabled}
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 8,
        width: fullWidth ? "100%" : "auto",
        minHeight: 48,
        padding: "0 26px",
        borderRadius: radius.button,
        fontSize: 15,
        fontWeight: 600,
        letterSpacing: "0.03em",
        cursor: isDisabled ? "not-allowed" : "pointer",
        opacity: isDisabled ? 0.4 : 1,
        transition: "opacity 0.2s, background 0.2s",
        ...vs,
        ...style,
      }}
    >
      {loading && (
        <div
          style={{
            width: 16,
            height: 16,
            borderRadius: "50%",
            border: `2px solid ${colors.border}`,
            borderTopColor: variant === "primary" ? colors.primary : colors.textMuted,
            animation: "spin-ring 0.7s linear infinite",
            flexShrink: 0,
          }}
        />
      )}
      {children}
    </motion.button>
  );
}
