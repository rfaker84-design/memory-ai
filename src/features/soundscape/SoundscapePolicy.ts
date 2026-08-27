import type { SoundscapeRouteDecision } from "./types";

const OFF_ROUTE: SoundscapeRouteDecision = { soundscape: null, reason: "off-route" };

export function resolveSoundscapeRoute(pathname: string | null | undefined): SoundscapeRouteDecision {
  if (pathname === "/") return { soundscape: "glow", reason: "home" };
  if (pathname === "/companion" || pathname === "/guest/companion") return { soundscape: "companion", reason: "companion" };
  if (pathname === "/memories" || pathname === "/guest/memories" || pathname === "/memory") return { soundscape: "stardust", reason: "memories" };
  if (/^\/memory\/[^/]+\/encounter$/u.test(pathname ?? "")) return { soundscape: "reunion", reason: "encounter" };
  return OFF_ROUTE;
}

export function isSoundscapeFeatureEnabled(value: unknown): boolean {
  return value === "true";
}
