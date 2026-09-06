import assert from "node:assert/strict";
import test from "node:test";
import { GuestActionHandoff, resolveGuestAction } from "./guestActionContinuation";
import { companionPrimaryStorageKey } from "../companion/companionHomeState";

function storage(entries: Record<string, string> = {}) {
  return { getItem: (key: string) => entries[key] ?? null, setItem: (key: string, value: string) => { entries[key] = value; }, removeItem: (key: string) => { delete entries[key]; } };
}
const memories = [{ id: "first", userId: "owner-a", name: "家人" }, { id: "second", userId: "owner-a", name: "朋友" }];
function responses(values: Response[]) {
  const calls: string[] = [];
  const request = (async (input: string | URL | Request, init?: RequestInit) => {
    assert.equal(init?.credentials, "same-origin");
    assert.equal(init?.method ?? "GET", "GET");
    calls.push(String(input));
    assert.ok(values.length, "unexpected request");
    return values.shift()!;
  }) as typeof fetch;
  return { calls, request };
}
const session = () => Response.json({ authenticated: true, user: { id: "session-owner-a" } });

test("an unauthenticated action never reads private memories", async () => {
  const port = responses([Response.json({ authenticated: false }, { status: 401 })]);
  assert.deepEqual(await resolveGuestAction(storage(), port.request), { status: "login" });
  assert.deepEqual(port.calls, ["/api/auth/session"]);
});

test("returning users resume only their selected owned person; other accounts' preferences do not choose a TA", async () => {
  for (const [selected, expected] of [["first", "first"], ["foreign-memory", null]] as const) {
    const port = responses([session(), Response.json(memories)]);
    const result = await resolveGuestAction(storage({ [companionPrimaryStorageKey("owner-a")]: selected }), port.request);
    assert.equal(result.status, "ready");
    if (result.status === "ready") assert.equal(result.selected?.id ?? null, expected);
    assert.deepEqual(port.calls, ["/api/auth/session", "/api/memories"]);
  }
});

test("no TA is distinguishable from a failed list or lost session", async () => {
  const empty = await resolveGuestAction(storage(), responses([session(), Response.json([])]).request);
  assert.equal(empty.status, "ready");
  if (empty.status === "ready") assert.deepEqual(empty.memories, []);
  assert.deepEqual(await resolveGuestAction(storage(), responses([session(), new Response(null, { status: 401 })]).request), { status: "login" });
  for (const response of [new Response(null, { status: 503 }), Response.json({}), Response.json([{}])]) {
    await assert.rejects(resolveGuestAction(storage(), responses([session(), response]).request));
  }
});

test("handoff retains the exact draft through creation and only the same authenticated owner and selected TA can consume it once", () => {
  const handoff = new GuestActionHandoff();
  handoff.remember("owner-a", { kind: "chat", text: "  今天想起一件小事。  " });
  assert.equal(handoff.read("owner-a")?.memoryId, null);
  assert.equal(handoff.bind("owner-a", "created-person"), "/memory-chat/created-person");
  assert.equal(handoff.takeChat("owner-a", "someone-else"), null);
  assert.equal(handoff.takeChat("owner-a", "created-person"), "  今天想起一件小事。  ");
  assert.equal(handoff.takeChat("owner-a", "created-person"), null);
});

test("account changes, expiry, and cancellation cannot disclose old drafts", () => {
  const handoff = new GuestActionHandoff();
  handoff.remember("owner-a", { kind: "chat", text: "private draft" });
  assert.equal(handoff.bind("owner-b", "person"), null);
  assert.equal(handoff.read("owner-a"), null);
  handoff.remember("owner-a", { kind: "pickup" }, 0);
  assert.equal(handoff.read("owner-a", 15 * 60_000), null);
  handoff.remember("owner-a", { kind: "pickup" });
  assert.equal(handoff.bind("owner-a", "a/b"), "/memory/a%2Fb/pickup");
  handoff.clear();
  assert.equal(handoff.hasPending(), false);
});
