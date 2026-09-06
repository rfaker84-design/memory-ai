import assert from "node:assert/strict";
import test from "node:test";
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { AppRouterContext, type AppRouterInstance } from "next/dist/shared/lib/app-router-context.shared-runtime";
import { JSDOM } from "jsdom";
import { useGuestAction } from "./useGuestAction";
import { companionPrimaryStorageKey } from "../companion/companionHomeState";
import { guestActionHandoff } from "./guestActionContinuation";

test("the actual action hook preserves a cancelled guest draft and resumes through the authenticated owner", async () => {
  const dom = new JSDOM('<div id="root"></div>', { url: "https://memoryai.test/guest/companion" });
  const original = { window: globalThis.window, document: globalThis.document, fetch: globalThis.fetch };
  Object.assign(globalThis, { window: dom.window, document: dom.window.document, IS_REACT_ACT_ENVIRONMENT: true });
  const root = createRoot(dom.window.document.getElementById("root")!);
  const routes: string[] = [];
  const router: AppRouterInstance = { push: (url) => { routes.push(url); }, replace: (url) => { routes.push(url); }, back() {}, forward() {}, refresh() {}, async prefetch() {} };
  let action: ReturnType<typeof useGuestAction>;
  function Harness() { action = useGuestAction({ kind: "chat", text: "还没说完的一句话" }); return null; }
  let signedIn = false;
  let privateReads = 0;
  const person = { id: "owned-person", userId: "external-owner", name: "家人" };
  globalThis.fetch = async (input, init) => {
    assert.equal(init?.method ?? "GET", "GET");
    if (input === "/api/auth/session") return signedIn ? Response.json({ authenticated: true, user: { id: "session-owner" } }) : Response.json({}, { status: 401 });
    assert.equal(input, "/api/memories"); privateReads += 1;
    return Response.json([person]);
  };
  try {
    await act(async () => { root.render(React.createElement(AppRouterContext.Provider, { value: router }, React.createElement(Harness))); });
    await act(async () => { await action!.continueAction(); });
    assert.equal(action!.loginOpen, true);
    assert.equal(privateReads, 0);
    await act(async () => { action!.closeLogin(); });
    assert.equal(action!.loginOpen, false);
    assert.deepEqual(routes, []);
    signedIn = true;
    dom.window.localStorage.setItem(companionPrimaryStorageKey("external-owner"), person.id);
    await act(async () => { await action!.continueAction(); });
    assert.equal(action!.loginOpen, false);
    assert.deepEqual(routes, ["/memory-chat/owned-person"]);
    assert.equal(guestActionHandoff.takeChat("session-owner", person.id), "还没说完的一句话");
    assert.equal(privateReads, 1);
  } finally {
    await act(async () => root.unmount()); guestActionHandoff.clear();
    Object.assign(globalThis, original); dom.window.close();
  }
});
