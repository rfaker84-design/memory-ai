import assert from "node:assert/strict";
import test from "node:test";
import { JSDOM } from "jsdom";
import { containModalFocus } from "./modalFocus";

test("modal traps both Tab directions, blocks background focus, closes on Escape and restores focus/inert", () => {
  const dom = new JSDOM('<body><main><button id="trigger">登录</button><div><section id="panel" tabindex="-1"><button id="first">关闭</button><input disabled><button id="last">暂不登录</button></section></div></main><nav id="nav"><a href="/">首页</a></nav></body>');
  const previous = { document: globalThis.document, HTMLElement: globalThis.HTMLElement, Node: globalThis.Node };
  Object.assign(globalThis, { document: dom.window.document, HTMLElement: dom.window.HTMLElement, Node: dom.window.Node });
  let cleanup: (() => void) | undefined;
  try {
    const doc = dom.window.document;
    const trigger = doc.getElementById("trigger") as HTMLElement;
    const first = doc.getElementById("first") as HTMLElement;
    const last = doc.getElementById("last") as HTMLElement;
    trigger.focus();
    let closed = 0;
    cleanup = containModalFocus(doc.getElementById("panel") as HTMLElement, () => { closed += 1; });
    assert.equal(doc.activeElement, first);
    assert.equal((doc.getElementById("nav") as HTMLElement).inert, true);
    first.dispatchEvent(new dom.window.KeyboardEvent("keydown", { key: "Tab", shiftKey: true, bubbles: true, cancelable: true }));
    assert.equal(doc.activeElement, last);
    last.dispatchEvent(new dom.window.KeyboardEvent("keydown", { key: "Tab", bubbles: true, cancelable: true }));
    assert.equal(doc.activeElement, first);
    trigger.focus();
    assert.equal(doc.activeElement, first);
    first.dispatchEvent(new dom.window.KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }));
    assert.equal(closed, 1);
    cleanup(); cleanup = undefined;
    assert.equal(doc.activeElement, trigger);
    assert.notEqual((doc.getElementById("nav") as HTMLElement).inert, true);
  } finally { cleanup?.(); Object.assign(globalThis, previous); dom.window.close(); }
});
