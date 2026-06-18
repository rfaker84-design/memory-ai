"use client";

import type { Variants, Transition } from "framer-motion";

/**
 * 忆见 — Apple 级动效预设
 * 克制 · 柔和 · 有延迟感 · 有回应感
 */

// ═══ Page transitions ═══
export const pageTransition = {
  initial: { opacity: 0, y: 10, filter: "blur(8px)" },
  animate: { opacity: 1, y: 0, filter: "blur(0px)" },
  transition: { duration: 0.6, ease: "easeOut" as const },
};

// ═══ Card interactions ═══
export const cardMotion = {
  initial: { opacity: 0, y: 12, scale: 0.98 },
  animate: { opacity: 1, y: 0, scale: 1 },
  transition: { duration: 0.4, ease: "easeOut" as const },
  whileHover: { scale: 1.02, y: -2, transition: { duration: 0.25 } },
  whileTap: { scale: 0.98, transition: { duration: 0.15 } },
};

// ═══ Message entrance ═══
export const messageMotion = {
  initial: { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.35, ease: "easeOut" as const },
};

// ═══ Breathing indicator ═══
export const breathingMotion = {
  animate: { opacity: [0.5, 1, 0.5] },
  transition: { duration: 2, repeat: Infinity, ease: "easeInOut" as const },
};

// ═══ Stagger item factory ═══
export function staggerItem(index: number) {
  return {
    initial: { opacity: 0, y: 10 },
    animate: { opacity: 1, y: 0 },
    transition: { delay: index * 0.08, duration: 0.35, ease: "easeOut" as const },
  };
}

// ═══ Stagger variants ═══
export const staggerContainer: Variants = {
  animate: { transition: { staggerChildren: 0.08, delayChildren: 0.1 } },
};

export const staggerChild: Variants = {
  initial: { opacity: 0, y: 10 },
  animate: { opacity: 1, y: 0, transition: { duration: 0.35, ease: "easeOut" } },
};

// ═══ Scale reveal ═══
export const scaleReveal = {
  initial: { opacity: 0, scale: 0.96 },
  animate: { opacity: 1, scale: 1 },
  transition: { duration: 0.5, ease: "easeOut" as const },
};

// ═══ Fade only ═══
export const fadeOnly = {
  initial: { opacity: 0 },
  animate: { opacity: 1 },
  transition: { duration: 0.4, ease: "easeOut" as const },
};