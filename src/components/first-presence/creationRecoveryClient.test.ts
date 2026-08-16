import assert from "node:assert/strict";
import test from "node:test";

import {
  clearCreationRecovery,
  consumeCreationChatHandoff,
  fetchCreationJson,
  fetchCreationRequest,
  CreationRecoveryRequestError,
  mediaPhase,
  markCreationChatHandoff,
  phaseForRemainingMedia,
  readCreationRecovery,
  readTransientCreationMedia,
  recoverPendingCreation,
  remainingMediaKinds,
  uploadCurrentCreationMedia,
  uploadCreationMedia,
  writeCreationRecovery,
} from "./creationRecoveryClient";

const KEY = "presence-11111111-1111-4111-8111-111111111111";
const MEMORY_ID = "22222222-2222-4222-8222-222222222222";
const memory = {
  id: MEMORY_ID,
  userId: "synthetic-owner",
  name: "Synthetic memory",
  relationship: "test",
  createdAt: "2026-07-26T00:00:00.000Z",
  updatedAt: "2026-07-26T00:00:00.000Z",
};

function storage() {
  const values = new Map<string, string>();
  return {
    getItem(key: string) {
      return values.get(key) ?? null;
    },
    setItem(key: string, value: string) {
      values.set(key, value);
    },
    removeItem(key: string) {
      values.delete(key);
    },
    values,
  };
}

test("temporary recovery storage contains only key, memory id, and phase", () => {
  const current = storage();
  assert.equal(writeCreationRecovery({
    idempotencyKey: KEY,
    memoryId: MEMORY_ID,
    phase: "photo-pending",
  }, current), true);

  const raw = Array.from(current.values.values())[0];
  assert.deepEqual(Object.keys(JSON.parse(raw)).sort(), [
    "idempotencyKey",
    "memoryId",
    "phase",
  ]);
  assert.deepEqual(readCreationRecovery(current), {
    idempotencyKey: KEY,
    memoryId: MEMORY_ID,
    phase: "photo-pending",
  });
  for (const forbidden of [
    "name",
    "relationship",
    "catchPhrase",
    "sharedMemory",
    "file",
    "phone",
    "cookie",
  ]) {
    assert.equal(raw.includes(forbidden), false);
  }
});

test("a successful creation handoff is tab-local, one-use, and never changes recovery data", () => {
  const current = storage();
  assert.equal(markCreationChatHandoff(MEMORY_ID, current), true);
  assert.equal(readCreationRecovery(current), null);
  assert.equal(consumeCreationChatHandoff(MEMORY_ID, current), true);
  assert.equal(consumeCreationChatHandoff(MEMORY_ID, current), false);

  assert.equal(markCreationChatHandoff(MEMORY_ID, current), true);
  assert.equal(consumeCreationChatHandoff("33333333-3333-4333-8333-333333333333", current), false);
  assert.equal(consumeCreationChatHandoff(MEMORY_ID, current), false);
});

test("creation timeout remains uncertain and exposes no automatic retry path", async () => {
  await assert.rejects(
    fetchCreationRequest("/api/memories", { method: "POST" }, ((_input, init) => new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
    })) as typeof fetch, undefined, 1),
    (error) => error instanceof CreationRecoveryRequestError
      && error.status === 408
      && error.code === "CREATION_REQUEST_TIMEOUT",
  );
});

test("creation JSON responses remain timeout-bound through a stalled body", async () => {
  await assert.rejects(
    fetchCreationJson("/api/memories", { method: "POST" }, async (_input, init) => ({
      ok: true, status: 201, headers: new Headers(),
      json: () => new Promise((_resolve, reject) => init?.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")), { once: true })),
    }) as Response, undefined, 1),
    (error) => error instanceof CreationRecoveryRequestError
      && error.status === 408
      && error.code === "CREATION_REQUEST_TIMEOUT",
  );
});

test("invalid or expanded records are rejected and removed", () => {
  const current = storage();
  current.setItem("memoryai:create-recovery:v1", JSON.stringify({
    idempotencyKey: KEY,
    memoryId: MEMORY_ID,
    phase: "created",
    name: "must not persist",
  }));
  assert.equal(readCreationRecovery(current), null);
  assert.equal(current.values.size, 0);
});

test("response-loss recovery reuses the original key and sends an empty body", async () => {
  const current = storage();
  writeCreationRecovery({ idempotencyKey: KEY, phase: "creating" }, current);
  const requests: Array<{ url: string; init?: RequestInit }> = [];
  const request = async (input: string | URL | Request, init?: RequestInit) => {
    requests.push({ url: String(input), init });
    return Response.json(memory);
  };

  const first = await recoverPendingCreation(request as typeof fetch, current);
  const second = await recoverPendingCreation(request as typeof fetch, current);
  assert.equal(first.status, "recovered");
  assert.equal(second.status, "recovered");
  assert.equal(requests.length, 2);
  for (const entry of requests) {
    assert.equal(entry.url, "/api/memories/recovery");
    assert.equal(entry.init?.method, "POST");
    assert.equal(entry.init?.body, JSON.stringify({}));
    assert.equal(new Headers(entry.init?.headers).get("Idempotency-Key"), KEY);
  }
  assert.deepEqual(readCreationRecovery(current), {
    idempotencyKey: KEY,
    phase: "creating",
  });
});

test("known stable memory routes without another recovery request", async () => {
  const current = storage();
  writeCreationRecovery({
    idempotencyKey: KEY,
    memoryId: MEMORY_ID,
    phase: "voice-pending",
  }, current);
  let requests = 0;
  const result = await recoverPendingCreation(async () => {
    requests += 1;
    return Response.json(memory);
  }, current);
  assert.deepEqual(result, {
    status: "known",
    record: {
      idempotencyKey: KEY,
      memoryId: MEMORY_ID,
      phase: "voice-pending",
    },
    memoryId: MEMORY_ID,
  });
  assert.equal(requests, 0);
});

test("404 preserves the original key while 401 clears it", async () => {
  const missing = storage();
  writeCreationRecovery({ idempotencyKey: KEY, phase: "creating" }, missing);
  const notFound = await recoverPendingCreation(
    async () => Response.json({ error: "MEMORY_NOT_FOUND" }, { status: 404 }),
    missing,
  );
  assert.equal(notFound.status, "not-found");
  assert.deepEqual(readCreationRecovery(missing), {
    idempotencyKey: KEY,
    phase: "creating",
  });

  const expired = storage();
  writeCreationRecovery({ idempotencyKey: KEY, phase: "creating" }, expired);
  const unauthenticated = await recoverPendingCreation(
    async () => Response.json({ error: "UNAUTHENTICATED" }, { status: 401 }),
    expired,
  );
  assert.equal(unauthenticated.status, "unauthenticated");
  assert.equal(readCreationRecovery(expired), null);
});

test("media phases retain only unfinished uploads", () => {
  assert.equal(mediaPhase(true), "photo-pending");
  assert.equal(phaseForRemainingMedia(["photo"]), "photo-pending");
  assert.deepEqual(
    remainingMediaKinds("media-pending", true),
    [],
    "a persisted photo is never selected for upload again",
  );
  assert.deepEqual(remainingMediaKinds("photo-pending", true), []);
  assert.deepEqual(remainingMediaKinds("voice-pending", false), []);
});

test("media upload stays scoped to the stable memory and accepts server deduplication", async () => {
  const file = new File(["synthetic"], "neutral.png", { type: "image/png" });
  const requestBodies: FormData[] = [];
  const result = await uploadCreationMedia(
    MEMORY_ID,
    file,
    async (input, init) => {
      assert.equal(input, "/api/media/upload");
      assert.equal(init?.method, "POST");
      assert.equal(init?.credentials, "same-origin");
      requestBodies.push(init?.body as FormData);
      return Response.json({
        asset: { id: "asset-1", mediaType: "image", status: "uploaded" },
        duplicate: true,
      });
    },
  );
  assert.equal(requestBodies[0].get("memoryId"), MEMORY_ID);
  assert.equal(requestBodies[0].get("file"), file);
  assert.deepEqual(result, {
    assetId: "asset-1",
    mediaType: "image",
    duplicate: true,
  });
});

test("current media handoff refuses to advance when its recovery checkpoint cannot be written", async () => {
  let mediaRequests = 0;
  const unavailableStorage = {
    getItem() { return null; },
    setItem() { throw new Error("storage unavailable"); },
    removeItem() {},
  };
  await assert.rejects(
    uploadCurrentCreationMedia({
      memoryId: MEMORY_ID,
      idempotencyKey: KEY,
      files: { photo: new File(["synthetic"], "portrait.png", { type: "image/png" }) },
    }, {
      storage: unavailableStorage,
      request: async () => {
        mediaRequests += 1;
        return Response.json({});
      },
    }),
    (error) => error instanceof Error && error.message === "RECOVERY_WRITE_FAILED",
  );
  assert.equal(mediaRequests, 0);
});

test("failed upload keeps the recovery record and never requests a first greeting", async () => {
  const current = storage();
  const requestedPaths: string[] = [];
  await assert.rejects(
    uploadCurrentCreationMedia({
      memoryId: MEMORY_ID,
      idempotencyKey: KEY,
      files: { photo: new File(["synthetic"], "portrait.png", { type: "image/png" }) },
    }, {
      storage: current,
      request: async (input) => {
        requestedPaths.push(String(input));
        return Response.json({ error: "STORAGE_UNAVAILABLE" }, { status: 503 });
      },
    }),
    (error) => error instanceof CreationRecoveryRequestError && error.status === 503,
  );
  assert.deepEqual(requestedPaths, ["/api/media/upload"]);
  assert.deepEqual(readCreationRecovery(current), {
    idempotencyKey: KEY,
    memoryId: MEMORY_ID,
    phase: "photo-pending",
  });
});

test("confirmed upload clears recovery and completes one handoff without a local greeting", async () => {
  const current = storage();
  const requestedPaths: string[] = [];
  const confirmed = await uploadCurrentCreationMedia({
    memoryId: MEMORY_ID,
    idempotencyKey: KEY,
    files: { photo: new File(["synthetic"], "portrait.png", { type: "image/png" }) },
  }, {
    storage: current,
    request: async (input) => {
      requestedPaths.push(String(input));
      return Response.json({
        asset: { id: "asset-confirmed", mediaType: "image", status: "uploaded" },
        duplicate: false,
      }, { status: 201 });
    },
  });
  assert.deepEqual(confirmed, [{ kind: "photo", assetId: "asset-confirmed", mediaType: "image" }]);
  assert.deepEqual(requestedPaths, ["/api/media/upload"]);
  assert.equal(readCreationRecovery(current), null);
  assert.equal(readTransientCreationMedia(MEMORY_ID), null);
});

test("media upload surfaces auth loss without leaking server details", async () => {
  const file = new File(["synthetic"], "neutral.wav", { type: "audio/wav" });
  await assert.rejects(
    uploadCreationMedia(
      MEMORY_ID,
      file,
      async () => Response.json({ error: "UNAUTHORIZED" }, { status: 401 }),
    ),
    (error) =>
      error instanceof CreationRecoveryRequestError
      && error.status === 401
      && error.code === "UNAUTHORIZED",
  );
});

test("an interrupted media upload remains a controlled retryable failure", async () => {
  const file = new File(["synthetic"], "neutral.wav", { type: "audio/wav" });
  await assert.rejects(
    uploadCreationMedia(
      MEMORY_ID,
      file,
      async () => Response.json(
        { error: "STORAGE_UNAVAILABLE" },
        { status: 503 },
      ),
    ),
    (error) =>
      error instanceof CreationRecoveryRequestError
      && error.status === 503
      && error.code === "STORAGE_UNAVAILABLE",
  );
});

test("recovery storage is isolated per tab-shaped storage instance", () => {
  const firstTab = storage();
  const secondTab = storage();
  writeCreationRecovery({ idempotencyKey: KEY, phase: "creating" }, firstTab);
  assert.equal(readCreationRecovery(secondTab), null);
  clearCreationRecovery(firstTab);
  assert.equal(readCreationRecovery(firstTab), null);
});
