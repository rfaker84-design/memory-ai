import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import React, { act } from "react";
import { hydrateRoot } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { JSDOM } from "jsdom";
import { RootDocument } from "./root-document";

const read = (file: string) => readFileSync(file, "utf8");
const hydrationWarning = /hydration|hydrated|server rendered|did not match/i;

type BrowserGlobals = {
  window: Window;
  document: Document;
  navigator: Navigator;
  Node: typeof Node;
  Text: typeof Text;
  HTMLElement: typeof HTMLElement;
  HTMLIFrameElement: typeof HTMLIFrameElement;
  SVGElement: typeof SVGElement;
  MutationObserver: typeof MutationObserver;
  getComputedStyle: typeof getComputedStyle;
  requestAnimationFrame: typeof requestAnimationFrame;
  cancelAnimationFrame: typeof cancelAnimationFrame;
};

async function hydrateDocument({
  userAgent,
  injectWebkitTouchCallout,
}: {
  userAgent: string;
  injectWebkitTouchCallout: boolean;
}) {
  const html = renderToString(
    <RootDocument>
      <main data-test-login="phone">手机号登录</main>
    </RootDocument>,
  );
  const dom = new JSDOM(`<!doctype html>${html}`, {
    pretendToBeVisual: true,
    url: "https://hydration.test/login",
  });
  Object.defineProperty(dom.window.navigator, "userAgent", {
    configurable: true,
    value: userAgent,
  });

  const globals: BrowserGlobals = {
    window: dom.window as unknown as Window,
    document: dom.window.document,
    navigator: dom.window.navigator,
    Node: dom.window.Node,
    Text: dom.window.Text,
    HTMLElement: dom.window.HTMLElement,
    HTMLIFrameElement: dom.window.HTMLIFrameElement,
    SVGElement: dom.window.SVGElement,
    MutationObserver: dom.window.MutationObserver,
    getComputedStyle: dom.window.getComputedStyle,
    requestAnimationFrame: dom.window.requestAnimationFrame,
    cancelAnimationFrame: dom.window.cancelAnimationFrame,
  };
  const previous = new Map<string, PropertyDescriptor | undefined>();
  for (const [key, value] of Object.entries(globals)) {
    previous.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
    Object.defineProperty(globalThis, key, { configurable: true, value });
  }

  const consoleErrors: string[] = [];
  const recoverableErrors: string[] = [];
  const originalConsoleError = console.error;
  let root: ReturnType<typeof hydrateRoot> | undefined;

  try {
    if (injectWebkitTouchCallout) {
      // Exact WebView mutation reported from the affected iPhone login path.
      const rootStyle = document.documentElement.style as CSSStyleDeclaration & {
        webkitTouchCallout: string;
      };
      rootStyle.webkitTouchCallout = "none";
      assert.equal(rootStyle.webkitTouchCallout, "none");

      // jsdom retains this WebKit-only declaration but does not serialize it.
      // Safari serializes the declaration into the root style attribute, which
      // is the actual React attribute-comparison path we must protect.
      if (!document.documentElement.getAttribute("style")) {
        document.documentElement.setAttribute("style", "-webkit-touch-callout: none;");
      }
      assert.match(document.documentElement.getAttribute("style") ?? "", /touch-callout/);
    }

    console.error = (...args: unknown[]) => {
      consoleErrors.push(args.map(String).join(" "));
    };

    await act(async () => {
      root = hydrateRoot(
        document,
        <RootDocument>
          <main data-test-login="phone">手机号登录</main>
        </RootDocument>,
        {
          onRecoverableError(error) {
            recoverableErrors.push(String(error));
          },
        },
      );
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
    });

    assert.ok(document.querySelector('[data-test-login="phone"]'));
    return { consoleErrors, recoverableErrors };
  } finally {
    const rootToUnmount = root;
    if (rootToUnmount) {
      await act(async () => {
        rootToUnmount.unmount();
        await new Promise<void>((resolve) => setTimeout(resolve, 0));
      });
    }
    console.error = originalConsoleError;
    for (const [key, descriptor] of previous) {
      if (descriptor) {
        Object.defineProperty(globalThis, key, descriptor);
      } else {
        Reflect.deleteProperty(globalThis, key);
      }
    }
    dom.window.close();
  }
}

test("root layout keeps SSR and hydration attributes user-agent independent", () => {
  const layout = read("app/layout.tsx");
  const rootDocument = read("app/root-document.tsx");
  const styles = read("app/globals.css");

  assert.match(layout, /<RootDocument>/);
  assert.match(rootDocument, /<html\s+lang="zh-CN"\s+suppressHydrationWarning>/);
  assert.doesNotMatch(rootDocument, /<html[^>]+\bstyle=/);
  assert.doesNotMatch(rootDocument, /\b(?:window|document|navigator)\s*(?:\.|\()/);
  assert.doesNotMatch(layout, /\b(?:window|document|navigator)\s*(?:\.|\()/);
  assert.match(styles, /html\s*\{[^}]*color-scheme:\s*light;/);
});

test("ordinary browser hydration emits no root mismatch warning", async () => {
  const result = await hydrateDocument({
    userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/138",
    injectWebkitTouchCallout: false,
  });

  assert.deepEqual(result.consoleErrors.filter((message) => hydrationWarning.test(message)), []);
  assert.deepEqual(result.recoverableErrors.filter((message) => hydrationWarning.test(message)), []);
});

test("soundscape restores browser preference only after hydration", () => {
  const provider = read("src/features/soundscape/SoundscapeProvider.tsx");

  assert.match(provider, /useState<SoundscapePreference>\(\(\) => \(\{ \.\.\.DEFAULT_SOUNDSCAPE_PREFERENCE \}\)\)/);
  assert.match(provider, /useEffect\(\(\) => \{\s*setPreference\(readSoundscapePreference\(window\.localStorage\)\);\s*setHydrated\(true\);\s*\}, \[\]\);/);
  assert.match(provider, /hydrated && decision\.soundscape \? <SoundscapeControl/);
  assert.doesNotMatch(provider, /useState<SoundscapePreference>\(\(\) => \([\s\S]*typeof window/);
});

test("iPhone WeChat root injection hydrates without an attribute mismatch warning", async () => {
  const result = await hydrateDocument({
    userAgent:
      "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 Version/17.5 Mobile/15E148 Safari/604.1 MicroMessenger/8.0.50",
    injectWebkitTouchCallout: true,
  });

  assert.deepEqual(result.consoleErrors.filter((message) => hydrationWarning.test(message)), []);
  assert.deepEqual(result.recoverableErrors.filter((message) => hydrationWarning.test(message)), []);
});

test("the direct login route remains inside the server-verified login flow", () => {
  const loginPage = read("app/login/page.tsx");

  assert.match(loginPage, /FirstPresenceFlow initialStage="login-phone"/);
  assert.doesNotMatch(loginPage, /suppressHydrationWarning/);
});
