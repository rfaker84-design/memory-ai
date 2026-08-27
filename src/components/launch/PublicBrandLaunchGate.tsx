"use client";

import { type ReactNode, useLayoutEffect, useState } from "react";
import { usePathname } from "next/navigation";

import StaticBrandLaunch from "./StaticBrandLaunch";
import { claimBrandLaunch } from "./staticBrandLaunchPolicy";
import { isPublicProductRoute } from "./publicBrandLaunchPolicy";

type PublicBrandLaunchGateProps = {
  children: ReactNode;
};

/**
 * A public route is allowed one branded opening per browser session. Keeping
 * this boundary above individual pages means a tab switch, Link navigation,
 * history navigation, or direct public deep link cannot replay the opening.
 */
export function PublicBrandLaunchGate({ children }: PublicBrandLaunchGateProps) {
  const pathname = usePathname();
  const publicRoute = isPublicProductRoute(pathname);
  const [showLaunch, setShowLaunch] = useState(publicRoute);

  useLayoutEffect(() => {
    if (!publicRoute) {
      setShowLaunch(false);
      return;
    }

    // A layout effect lets an already-claimed session remove the server-rendered
    // splash before the route paints, avoiding a visible replay on reload.
    setShowLaunch(claimBrandLaunch(window.sessionStorage));
  }, [publicRoute]);

  if (publicRoute && showLaunch) {
    return <StaticBrandLaunch ready onComplete={() => setShowLaunch(false)} />;
  }

  return <>{children}</>;
}
