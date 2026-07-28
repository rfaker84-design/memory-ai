import { validateApiBaseUrl } from "../../build/session-origin";

function appHostname(): string {
  const parsed = new URL(__MOBILE_APP_ORIGIN__);
  if (parsed.protocol !== "https:" || parsed.port || parsed.pathname !== "/") {
    throw new Error("The packaged App must run from a canonical HTTPS local origin.");
  }
  return parsed.hostname;
}

function optionalDebugHttpsUrl(name: string, value: string | undefined): string | null {
  const raw = value?.trim();
  if (!raw) return null;
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    throw new Error(`${name} must be an absolute HTTPS URL.`);
  }
  if (parsed.protocol !== "https:" || parsed.hostname === "yijianmemory.cn" || parsed.hostname === "www.yijianmemory.cn") {
    throw new Error(`${name} must be an HTTPS non-production URL.`);
  }
  return parsed.toString().replace(/\/$/, "");
}

export const runtimeConfig = Object.freeze({
  appOrigin: __MOBILE_APP_ORIGIN__,
  apiBaseUrl: validateApiBaseUrl(
    __MOBILE_DEBUG_BUILD__ ? "debug" : "release",
    appHostname(),
    import.meta.env.VITE_MOBILE_API_BASE_URL,
  ),
  stagingAccessToken: __MOBILE_DEBUG_BUILD__ ? __MOBILE_STAGING_ACCESS_TOKEN__ || null : null,
});

export function debugVideoUrl(): string | null {
  if (!__MOBILE_DEBUG_BUILD__) return null;
  return optionalDebugHttpsUrl("VITE_MOBILE_TEST_VIDEO_URL", import.meta.env.VITE_MOBILE_TEST_VIDEO_URL);
}
