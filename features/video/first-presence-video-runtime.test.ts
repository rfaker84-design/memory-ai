import assert from "node:assert/strict";
import test from "node:test";

import {
  loadVideoInputDataUrl,
  VIDEO_INPUT_MAX_BYTES,
} from "./first-presence-video-runtime";

test("worker input fetch is one bounded no-redirect image read", async () => {
  let calls = 0;
  const value = await loadVideoInputDataUrl(
    "https://storage.memoryai.test/signed-input",
    async (input, init) => {
      calls += 1;
      assert.equal(input, "https://storage.memoryai.test/signed-input");
      assert.equal(init?.redirect, "error");
      assert.ok(init?.signal instanceof AbortSignal);
      return new Response(new Uint8Array([1, 2, 3]), {
        headers: { "content-type": "image/png", "content-length": "3" },
      });
    },
  );
  assert.equal(calls, 1);
  assert.equal(value, "data:image/png;base64,AQID");
});

test("worker input rejects slow, non-image, empty, and oversized sources before provider staging", async () => {
  await assert.rejects(
    loadVideoInputDataUrl("https://storage.memoryai.test/slow", async (_input, init) => new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")), { once: true });
    }), 1),
    /VIDEO_INPUT_SOURCE_UNAVAILABLE/,
  );
  await assert.rejects(
    loadVideoInputDataUrl("https://storage.memoryai.test/slow-body", async (_input, init) => {
      const body = new ReadableStream<Uint8Array>({
        start(stream) {
          init?.signal?.addEventListener("abort", () => stream.error(new DOMException("aborted", "AbortError")), { once: true });
        },
      });
      return new Response(body, { headers: { "content-type": "image/png" } });
    }, 1),
    /VIDEO_INPUT_SOURCE_UNAVAILABLE/,
  );
  for (const response of [
    new Response("not an image", { headers: { "content-type": "text/plain" } }),
    new Response(null, { headers: { "content-type": "image/jpeg", "content-length": "0" } }),
    new Response("small", { headers: { "content-type": "image/jpeg", "content-length": String(VIDEO_INPUT_MAX_BYTES + 1) } }),
  ]) {
    await assert.rejects(
      loadVideoInputDataUrl("https://storage.memoryai.test/invalid", async () => response),
      /VIDEO_INPUT_SOURCE_UNAVAILABLE/,
    );
  }
});

test("already-local data URL is accepted only within the public image size ceiling", async () => {
  const source = "data:image/png;base64,AQID";
  assert.equal(await loadVideoInputDataUrl(source), source);
  await assert.rejects(
    loadVideoInputDataUrl(`data:image/png;base64,${"A".repeat(Math.ceil(VIDEO_INPUT_MAX_BYTES * 4 / 3) + 200)}`),
    /VIDEO_INPUT_SOURCE_UNAVAILABLE/,
  );
});
