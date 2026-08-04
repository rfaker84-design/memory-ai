import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const app = readFileSync(new URL("../App.tsx", import.meta.url), "utf8");
const api = readFileSync(new URL("./api.ts", import.meta.url), "utf8");

test("mobile profile reads and persists birth date through the session-bound account API", () => {
  assert.match(api, /getAccountProfile\(\)[\s\S]*?\/api\/account\/profile/);
  assert.match(api, /updateBirthDate\(birthDate: string\)[\s\S]*?method: "PATCH"/);
  assert.match(app, /productApi\.getAccountProfile\(\)/);
  assert.match(app, /productApi\.updateBirthDate\(birthDate\)/);
  assert.match(app, /生日已保存；你可以随时修改。/);
  assert.doesNotMatch(app, /localStorage\.setItem\([^\n]*birthDate/);
});
