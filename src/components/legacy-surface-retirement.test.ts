import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import test from "node:test";

const root = new URL("./", import.meta.url);

test("retired consciousness and autonomous splash surfaces cannot be reconnected to the first-release product", () => {
  for (const relative of [
    "splash-v4/SplashScreenV4.tsx",
    "splash-v5/SplashScreenV5.tsx",
    "splash-v8/ConsciousnessBootScreen.tsx",
    "splash-v9/MindBootScreen.tsx",
    "splash-v10/ConsciousnessOntologyScreen.tsx",
    "splash-vinf/InfiniteRecursionScreen.tsx",
  ]) {
    assert.equal(existsSync(new URL(relative, root)), false, `retired surface remains: ${relative}`);
  }
  assert.equal(existsSync(new URL("../lib/recursion-types.ts", root)), false, "retired recursion model remains");
});
