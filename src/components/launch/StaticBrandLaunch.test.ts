import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const launch = readFileSync(new URL("./StaticBrandLaunch.tsx", import.meta.url), "utf8");

test("the approved launch uses the first home-v2 poster and remains until that exact image can paint", () => {
  assert.match(launch, /src="\/home-hero-assets\/elderly-woman\.home-v2\.poster\.webp"/);
  assert.match(launch, /const \[backgroundReady, setBackgroundReady\] = useState\(false\)/);
  assert.match(launch, /if \(!minimumElapsed \|\| !ready \|\| !backgroundReady\) return;/);
  assert.match(launch, /event\.currentTarget\.decode\(\)/);
  assert.doesNotMatch(launch, /owner-confirmed-warm-presence\.png/);
});
