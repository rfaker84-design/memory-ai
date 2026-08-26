// Keep the established artwork and restraint, while making the approved
// opening brief enough that cold launch never reads as a blank wait.
export const BRAND_LAUNCH_DURATION_MS = 1200;
export const BRAND_LAUNCH_EXIT_MS = 250;
export const BRAND_LAUNCH_HOLD_MS = BRAND_LAUNCH_DURATION_MS - BRAND_LAUNCH_EXIT_MS;
export const BRAND_LAUNCH_SESSION_KEY = "memoryai:static-brand-launch-seen";

type SessionStorageLike = Pick<Storage, "getItem" | "setItem">;

export function createBrandLaunchGate() {
  let claimedInRuntime = false;

  return (storage: SessionStorageLike) => {
    if (claimedInRuntime) return false;
    claimedInRuntime = true;

    try {
      if (storage.getItem(BRAND_LAUNCH_SESSION_KEY) === "1") return false;
      storage.setItem(BRAND_LAUNCH_SESSION_KEY, "1");
    } catch {
      // The runtime claim still prevents repeats when Web Storage is unavailable.
    }

    return true;
  };
}

export const claimBrandLaunch = createBrandLaunchGate();
