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
  connection?: { saveData?: boolean; effectiveType?: string };
};

/**
 * Browser thermal sensors are not standardized. This hook therefore uses the
 * safe signals browsers can expose (reduced motion, battery, low-end hardware,
 * constrained network and background visibility). A single first-load long
 * task is not a device capability signal: treating it as one permanently
 * disabled an approved owner motion pack before its video could render. A host
 * that
 * later exposes a thermal signal can add it to constrainedPerformance without
 * changing this visual contract.
 */
export function useQuietCompanionPresence(input: { reducedMotion: boolean; replying: boolean }): QuietCompanionState {
  const [lowBattery, setLowBattery] = useState(false);
  const [backgrounded, setBackgrounded] = useState(false);
  const constrainedDevice = useMemo(() => {
    if (typeof navigator === "undefined") return false;
    const browser = navigator as NavigatorWithSignals;
    return (typeof browser.deviceMemory === "number" && browser.deviceMemory <= 2)
      || (typeof navigator.hardwareConcurrency === "number" && navigator.hardwareConcurrency <= 2);
  }, []);
  const constrainedNetwork = useMemo(() => {
    if (typeof navigator === "undefined") return false;
    const connection = (navigator as NavigatorWithSignals).connection;
    return connection?.saveData === true || connection?.effectiveType === "slow-2g" || connection?.effectiveType === "2g";
  }, []);

  useEffect(() => {
    if (typeof document === "undefined") return;
    const update = () => setBackgrounded(document.visibilityState !== "visible");
    update();
    document.addEventListener("visibilitychange", update);
    return () => document.removeEventListener("visibilitychange", update);
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

  return resolveQuietCompanionState({
    reducedMotion: input.reducedMotion,
    lowBattery,
    constrainedPerformance: constrainedDevice || constrainedNetwork || backgrounded,
    replying: input.replying,
  });
}
