"use client";

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";

const AppLaunchContext = createContext({ complete: false, finish: () => {} });

/** Lives in the root layout, so internal navigation never starts a new launch. */
export function AppLaunchProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [complete, setComplete] = useState(false);
  const finish = useCallback(() => setComplete(true), []);

  useEffect(() => {
    // A direct entry into another product page has already opened the app.
    if (pathname !== "/") finish();
  }, [pathname, finish]);

  return <AppLaunchContext.Provider value={{ complete, finish }}>{children}</AppLaunchContext.Provider>;
}

export const useAppLaunch = () => useContext(AppLaunchContext);
