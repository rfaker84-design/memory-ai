import { createHash } from "node:crypto";

import { STAGING_API_ORIGIN } from "@/src/server/runtime/staging-contract";

const MAX_SAMPLE_BYTES = 10 * 1024 * 1024;
const MIN_PROVIDER_FETCH_WINDOW_SECONDS = 12 * 60;

export class StagingVoiceCloneUrlError extends Error {
  constructor(readonly code: string) {
    super(code);
  }
}

type FetchLike = typeof fetch;

type VerifyStagingVoiceCloneUrlInput = {
  url: string;
  expectedBody: Buffer;
  expiresAt: string;
};

function fail(code: string): never {
  throw new StagingVoiceCloneUrlError(code);
}

function safeExpiry(url: URL, expiresAt: string, now: number): void {
  const urlExpiry = Number(url.searchParams.get("expires"));
  const declaredExpiry = Date.parse(expiresAt);
  const minimum = now + MIN_PROVIDER_FETCH_WINDOW_SECONDS * 1000;
  if (!Number.isSafeInteger(urlExpiry) || urlExpiry * 1000 < minimum || !Number.isFinite(declaredExpiry) || declaredExpiry < minimum) {
    fail("VOICE_SAMPLE_URL_EXPIRY_INVALID");
  }
}

export async function verifyStagingVoiceCloneSampleUrl(
  input: VerifyStagingVoiceCloneUrlInput,
  fetchImpl: FetchLike = fetch,
  now = Date.now(),
): Promise<void> {
  if (!Buffer.isBuffer(input.expectedBody) || input.expectedBody.byteLength === 0 || input.expectedBody.byteLength > MAX_SAMPLE_BYTES) {
    fail("VOICE_SAMPLE_URL_BODY_INVALID");
  }

  let url: URL;
  try {
    url = new URL(input.url);
  } catch {
    fail("VOICE_SAMPLE_URL_INVALID");
  }
  if (url.origin !== STAGING_API_ORIGIN || url.pathname !== "/api/media/local" || !url.searchParams.get("key") || !url.searchParams.get("signature")) {
    fail("VOICE_SAMPLE_URL_INVALID");
  }
  safeExpiry(url, input.expiresAt, now);

  let response: Response;
  try {
    // Intentionally no Cookie, Authorization, or test-only headers. This is
    // the same capability boundary the provider sees when it retrieves the
    // short-lived media URL.
    response = await fetchImpl(url, { redirect: "error" });
  } catch {
    fail("VOICE_SAMPLE_URL_FETCH_FAILED");
  }
  const contentType = response.headers.get("content-type")?.split(";", 1)[0]?.toLowerCase();
  if (response.status !== 200 || response.redirected || (contentType !== "audio/wav" && contentType !== "audio/x-wav")) {
    fail("VOICE_SAMPLE_URL_RESPONSE_INVALID");
  }
  const body = Buffer.from(await response.arrayBuffer());
  const actual = createHash("sha256").update(body).digest("hex");
  const expected = createHash("sha256").update(input.expectedBody).digest("hex");
  if (actual !== expected) fail("VOICE_SAMPLE_URL_BYTE_MISMATCH");
}
