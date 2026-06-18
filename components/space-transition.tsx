"use client";

import { usePathname } from "next/navigation";
import { motion } from "framer-motion";
import { useRef, type ReactNode } from "react";
import { cameraEnterInitial, cameraEnter, spaceTiming } from "../app/lib/space-motion";

/* =========================================================================
   SpaceTransition — pages are positions, not destinations.
   ========================================================================= */

export default function SpaceTransition({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const prevPath = useRef(pathname);
  const isFirstRender = useRef(true);

  const isNavigating = !isFirstRender.current && prevPath.current !== pathname;

  if (isFirstRender.current) isFirstRender.current = false;
  prevPath.current = pathname;

  return (
    <motion.div
      key={pathname}
      initial={isNavigating ? cameraEnterInitial : undefined}
      animate={cameraEnter}
      transition={spaceTiming.pageEnter}
    >
      {children}
    </motion.div>
  );
}