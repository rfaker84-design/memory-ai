import { useEffect, useMemo, useState } from "react";

export type QuietCompanionState = "static" | "quiet" | "replying";

export function resolveQuietCompanionState(input: {
  reducedMotion: boolean;
  lowBattery: boolean;
  constrainedPerformance: boolean;
  replying: boolean;
}): QuietCompanionState {
  if (input.reducedMotion || input.lowBattery || input.constrainedPerformance) return "static";
  return input.replying ? "replying" : "quiet";
}

type BatteryLike = {
  level: number;
  charging: boolean;
  addEventListener(type: "levelchange" | "chargingchange", listener: () => void): void;
  removeEventListener(type: "levelchange" | "chargingchange", listener: () => void): void;
};

type NavigatorWithSignals = Navigator & {
  deviceMemory?: number;
  getBattery?: () => Promise<BatteryLike>;
};

/**
 * Browser thermal sensors are not standardized. This hook therefore uses the
 * safe signals browsers can expose (reduced motion, battery, low-end hardware,
 * and long tasks); a host that later has a thermal signal can pass it as
 * constrainedPerformance without changing the visual contract.
 */
export function useQuietCompanionPresence(input: { reducedMotion: boolean; replying: boolean }): QuietCompanionState {
  const [lowBattery, setLowBattery] = useState(false);
  const [longTaskObserved, setLongTaskObserved] = useState(false);
  const constrainedDevice = useMemo(() => {
    if (typeof navigator === "undefined") return false;
    const browser = navigator as NavigatorWithSignals;
    return (typeof browser.deviceMemory === "number" && browser.deviceMemory <= 2)
      || (typeof navigator.hardwareConcurrency === "number" && navigator.hardwareConcurrency <= 2);
  }, []);

  useEffect(() => {
    const browser = navigator as NavigatorWithSignals;
    if (!browser.getBattery) return;
    let active = true;
    let battery: BatteryLike | undefined;
    const update = () => { if (active && battery) setLowBattery(!battery.charging && battery.level <= 0.15); };
    void browser.getBattery().then((value) => {
      if (!active) return;
      battery = value;
      update();
      battery.addEventListener("levelchange", update);
      battery.addEventListener("chargingchange", update);
    }).catch(() => undefined);
    return () => {
      active = false;
      battery?.removeEventListener("levelchange", update);
      battery?.removeEventListener("chargingchange", update);
    };
  }, []);

  useEffect(() => {
    if (typeof PerformanceObserver === "undefined") return;
    try {
      const observer = new PerformanceObserver((entries) => {
        if (entries.getEntries().some((entry) => entry.duration >= 200)) setLongTaskObserved(true);
      });
      observer.observe({ type: "longtask", buffered: true });
      return () => observer.disconnect();
    } catch {
      return;
    }
  }, []);

  return resolveQuietCompanionState({
    reducedMotion: input.reducedMotion,
    lowBattery,
    constrainedPerformance: constrainedDevice || longTaskObserved,
    replying: input.replying,
  });
}
