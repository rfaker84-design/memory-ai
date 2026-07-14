import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let client: SupabaseClient | undefined;

function runtimeClient(): SupabaseClient {
  if (client) return client;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error("LEGACY_SUPABASE_NOT_CONFIGURED");
  client = createClient(url, key);
  return client;
}

/** @deprecated Legacy browser compatibility only; never initialized at build. */
export const supabase = new Proxy({} as SupabaseClient, {
  get(_target, property) {
    const resolved = runtimeClient();
    const value = Reflect.get(resolved, property, resolved) as unknown;
    return typeof value === "function" ? value.bind(resolved) : value;
  },
});
