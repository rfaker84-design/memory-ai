import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (file: string) => readFileSync(file, "utf8");

test("root layout keeps SSR and hydration attributes user-agent independent", () => {
  const layout = read("app/layout.tsx");
  const styles = read("app/globals.css");

  assert.match(layout, /<html\s+lang="zh-CN">/);
  assert.doesNotMatch(layout, /<html[^>]+\bstyle=/);
  assert.doesNotMatch(layout, /suppressHydrationWarning/);
  assert.doesNotMatch(layout, /(?:window|document|navigator|useEffect)\b/);
  assert.match(styles, /html\s*\{[^}]*color-scheme:\s*light;/);
});

test("the direct login route remains inside the server-verified login flow", () => {
  const loginPage = read("app/login/page.tsx");

  assert.match(loginPage, /FirstPresenceFlow initialStage="login-phone"/);
  assert.doesNotMatch(loginPage, /suppressHydrationWarning/);
});
