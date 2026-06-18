/* =========================================================================
   忆见 MemoryAI — Visual Sync Layer
   Single source of truth · Warm theme only
   Now rooted in pixel-theme.ts for pixel-perfect App Store alignment
   ========================================================================= */

import { palette, gradient, typography, radius, shadow, motion as m, screenshot } from "./pixel-theme";

export const colors = palette;
export { palette, gradient, typography, radius, screenshot };
export const shadows = shadow;
export { shadow };

/* Motion — unified naming */
export const motion = {
  ...m,
  pageTransition: m.pageEnter,   // alias for backward compat
  fadeIn:         m.fadeIn,
  slideUp:        { initial: { opacity:0, y:6 }, animate: { opacity:1, y:0 }, transition: { duration:0.2, ease:"easeOut" as const } },
  pressDown:      m.press,
};

export const motionPresets = motion;
