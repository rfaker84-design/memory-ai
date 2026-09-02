import assert from "node:assert/strict";
import test from "node:test";

import { StagingVoiceCloneUrlError, verifyStagingVoiceCloneSampleUrl } from "./staging-signed-audio-url";

const body = Buffer.from("synthetic-wav-body");
const url = "https://api.staging.yijianmemory.cn/api/media/local?key=media%2Fsynthetic%2F11111111-1111-4111-8111-111111111111%2Faudio%2F22222222-2222-4222-8222-222222222222.wav&expires=2000&signature=opaque";
const expiry = "1970-01-01T00:33:20.000Z";

test("Staging voice-clone sample URL is anonymously retrievable and byte-exact", async () => {
  let observed: RequestInit | undefined;
  await verifyStagingVoiceCloneSampleUrl({ url, expectedBody: body, expiresAt: expiry }, async (_url, init) => {
    observed = init;
    return new Response(body, { status: 200, headers: { "content-type": "audio/wav" } });
  }, 0);
  assert.deepEqual(observed, { redirect: "error" });
});

test("Staging voice-clone sample URL rejects wrong media and byte changes", async () => {
  for (const response of [
    new Response("html", { status: 200, headers: { "content-type": "text/html" } }),
    new Response(Buffer.from("other"), { status: 200, headers: { "content-type": "audio/wav" } }),
  ]) {
    await assert.rejects(
      verifyStagingVoiceCloneSampleUrl({ url, expectedBody: body, expiresAt: expiry }, async () => response, 0),
      (error: unknown) => error instanceof StagingVoiceCloneUrlError,
    );
  }
});
