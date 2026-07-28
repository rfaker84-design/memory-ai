const productionHosts = new Set(["yijianmemory.cn", "www.yijianmemory.cn"]);

function optionalNonProductionHttpsUrl(name: string, value: string | undefined): string | null {
  const raw = value?.trim();
  if (!raw) return null;
  const parsed = new URL(raw);
  if (parsed.protocol !== "https:" || productionHosts.has(parsed.hostname)) {
    throw new Error(`${name} must be an HTTPS non-production URL.`);
  }
  return parsed.toString().replace(/\/$/, "");
}

export const runtimeConfig = Object.freeze({
  apiBaseUrl: optionalNonProductionHttpsUrl("VITE_MOBILE_API_BASE_URL", import.meta.env.VITE_MOBILE_API_BASE_URL),
});

export function debugVideoUrl(): string | null {
  if (!__MOBILE_DEBUG_BUILD__) return null;
  return optionalNonProductionHttpsUrl("VITE_MOBILE_TEST_VIDEO_URL", import.meta.env.VITE_MOBILE_TEST_VIDEO_URL);
}
