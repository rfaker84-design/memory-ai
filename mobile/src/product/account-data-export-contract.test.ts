import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const api = readFileSync(new URL("./api.ts", import.meta.url), "utf8");
const app = readFileSync(new URL("../App.tsx", import.meta.url), "utf8");

test("mobile reaches the protected data-export contract without automatic download retry", () => {
  assert.match(api, /async downloadAccountDataExport\(\): Promise<Blob>[\s\S]*?mobileApiFetch\("\/api\/account\/export", \{ method: "POST", cache: "no-store" \}\)/);
  assert.match(api, /contentType\.toLowerCase\(\)\.startsWith\("application\/json"\)/);
  assert.match(app, /screen === "dataExport"/);
  assert.match(app, /await productApi\.downloadAccountDataExport\(\)/);
  assert.match(app, /setResumeExportAfterLogin\(true\)/);
  assert.match(app, /if \(resumeExportAfterLogin\)[\s\S]*?setScreen\("dataExport"\)/);
  assert.doesNotMatch(app, /setInterval\([\s\S]*?downloadAccountDataExport/);
});
