import assert from "node:assert/strict";
import test from "node:test";

import { AccountProfileRequestError, readAdultProfile, saveAdultBirthDate } from "./accountProfileClient";

test("profile client uses same-origin no-store reads and a narrow PATCH body", async () => {
  const calls: Array<{ input: RequestInfo | URL; init?: RequestInit }> = [];
  const fetcher = async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ input, init });
    return new Response(JSON.stringify({ birthDate: "1990-01-02", adultEligible: true }), { status: 200 });
  };
  await readAdultProfile(fetcher as typeof fetch);
  await saveAdultBirthDate("1990-01-02", fetcher as typeof fetch);
  assert.equal(calls[0]?.input, "/api/account/profile");
  assert.equal(calls[0]?.init?.credentials, "same-origin");
  assert.equal(calls[0]?.init?.cache, "no-store");
  assert.equal(calls[1]?.init?.method, "PATCH");
  assert.equal(calls[1]?.init?.body, '{"birthDate":"1990-01-02"}');
});

test("profile client exposes a stable malformed-date rejection code", async () => {
  await assert.rejects(
    () => saveAdultBirthDate("not-a-date", async () => new Response(JSON.stringify({ error: "INVALID_BIRTH_DATE" }), { status: 400 }) as Response),
    (error: unknown) => error instanceof AccountProfileRequestError && error.code === "INVALID_BIRTH_DATE",
  );
});

test("profile reads retain their timeout through a stalled JSON body", async () => {
  const stalledBody = async (_input: RequestInfo | URL, init?: RequestInit) => ({
    ok: true, status: 200, headers: new Headers(),
    json: () => new Promise((_resolve, reject) => init?.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")), { once: true })),
  }) as Response;
  await assert.rejects(
    readAdultProfile(stalledBody as typeof fetch, 1),
    (error: unknown) => error instanceof AccountProfileRequestError && error.code === "PROFILE_REQUEST_TIMEOUT",
  );
});

test("profile reads relay page unmount aborts to their request", async () => {
  const parent = new AbortController();
  let requestSignal: AbortSignal | undefined;
  const blocked = async (_input: RequestInfo | URL, init?: RequestInit) => {
    requestSignal = init?.signal ?? undefined;
    return new Promise<Response>((_resolve, reject) => init?.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")), { once: true }));
  };
  const pending = readAdultProfile(blocked as typeof fetch, 12_000, parent.signal);
  parent.abort();
  await assert.rejects(pending, (error: unknown) => error instanceof DOMException && error.name === "AbortError");
  assert.equal(requestSignal?.aborted, true);
});
