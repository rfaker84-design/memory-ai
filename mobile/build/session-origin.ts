export type MobileBuildChannel = "debug" | "release";

type BuildEnvironment = Readonly<Record<string, string | undefined>>;

const ROOT_DOMAIN = "yijianmemory.cn";
const RELEASE_APP_HOSTNAME = `app.${ROOT_DOMAIN}`;
const DEBUG_APP_HOSTNAME = `app.staging.${ROOT_DOMAIN}`;

function normalizeHostname(value: string | undefined, fallback: string): string {
  const hostname = (value ?? fallback).trim().toLowerCase();
  if (!hostname || hostname.includes(":") || hostname.includes("/") || hostname.includes("@")) {
    throw new Error("MOBILE_APP_ORIGIN_HOST must be a hostname without a scheme, path, or port.");
  }
  return hostname;
}

function expectedApiHostname(appHostname: string): string {
  if (!appHostname.startsWith("app.")) {
    throw new Error("The local packaged App origin must use the app.<environment>.yijianmemory.cn hostname pattern.");
  }
  return `api.${appHostname.slice("app.".length)}`;
}

export function validateApiBaseUrl(
  channel: MobileBuildChannel,
  appHostname: string,
  value: string | undefined,
): string | null {
  const raw = value?.trim();
  if (!raw) return null;
  if (channel !== "debug") {
    throw new Error("VITE_MOBILE_API_BASE_URL is Debug-only and must never be present in a Release build.");
  }

  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    throw new Error("VITE_MOBILE_API_BASE_URL must be an absolute HTTPS URL.");
  }

  const expectedHostname = expectedApiHostname(appHostname);
  if (
    parsed.protocol !== "https:"
    || parsed.hostname !== expectedHostname
    || parsed.port
    || parsed.username
    || parsed.password
    || parsed.pathname !== "/"
    || parsed.search
    || parsed.hash
  ) {
    throw new Error(
      `VITE_MOBILE_API_BASE_URL must be exactly https://${expectedHostname} for the packaged App origin.`,
    );
  }
  return parsed.origin;
}

export function resolveMobileSessionContract(
  channel: MobileBuildChannel,
  environment: BuildEnvironment,
) {
  const appHostname = normalizeHostname(
    environment.MOBILE_APP_ORIGIN_HOST,
    channel === "debug" ? DEBUG_APP_HOSTNAME : RELEASE_APP_HOSTNAME,
  );
  const expectedHostname = channel === "debug" ? DEBUG_APP_HOSTNAME : RELEASE_APP_HOSTNAME;
  if (appHostname !== expectedHostname) {
    throw new Error(`MOBILE_APP_ORIGIN_HOST must be ${expectedHostname} for a ${channel} build.`);
  }

  if (channel === "release" && environment.VITE_MOBILE_TEST_VIDEO_URL?.trim()) {
    throw new Error("VITE_MOBILE_TEST_VIDEO_URL is Debug-only and must never be present in a Release build.");
  }

  return Object.freeze({
    channel,
    appHostname,
    appOrigin: `https://${appHostname}`,
    apiBaseUrl: validateApiBaseUrl(channel, appHostname, environment.VITE_MOBILE_API_BASE_URL),
  });
}
