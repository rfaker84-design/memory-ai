import { PHASE_PRODUCTION_BUILD } from "next/constants";

import { assertProductionAuthConfiguration } from "./src/server/auth/production-config";

export async function register(): Promise<void> {
  if (
    process.env.NEXT_RUNTIME === "edge"
    || process.env.NEXT_PHASE === PHASE_PRODUCTION_BUILD
  ) return;

  assertProductionAuthConfiguration();
}
