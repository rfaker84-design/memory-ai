import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const page = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");

test("formal chat announces cold-start and recovery states without changing the read boundary", () => {
  assert.match(page, /role=\{state\.status === "loading" \? "status" : "alert"\}/);
  assert.match(page, /aria-live=\{state\.status === "loading" \? "polite" : "assertive"\}/);
  assert.match(page, /\(state\.status === "timeout" \|\| state\.status === "error"\) && <button type="button" onClick=\{\(\) => void load\(\)\}>/);
  assert.match(page, /读取等待过久，尚未创建或修改任何内容。/);
  assert.match(page, /loadOwnedMemory\(id, signal\)/);
});
