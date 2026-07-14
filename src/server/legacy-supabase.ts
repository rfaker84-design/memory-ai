import {
  createClient as createSupabaseClient,
  type SupabaseClient,
} from "@supabase/supabase-js";

import { createLazyClient } from "./lazy-client";

export class LegacySupabaseConfigurationError extends Error {
  constructor() {
    super("LEGACY_SUPABASE_NOT_CONFIGURED");
  }
}

function runtimeClient(): SupabaseClient {
  const url = process.env.LEGACY_SUPABASE_URL;
  const key = process.env.LEGACY_SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new LegacySupabaseConfigurationError();
  return createSupabaseClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/** Legacy-only compatibility boundary. Client creation occurs on first request use. */
export function createClient(
  legacyUrl?: string,
  legacyKey?: string
): SupabaseClient {
  void legacyUrl;
  void legacyKey;
  return createLazyClient(runtimeClient);
}

export const legacySupabaseAdmin = createClient();
