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
    "splash-v6/LivingMemoryScreen.tsx",
    "splash-v6/EntityPresence.tsx",
    "splash-v6/EntityResponse.tsx",
  ]) {
    assert.equal(existsSync(new URL(relative, root)), false, `retired surface remains: ${relative}`);
  }
  assert.equal(existsSync(new URL("ConsciousnessFieldRenderer.tsx", root)), false, "retired consciousness field remains");
  assert.equal(existsSync(new URL("../hooks/useConvergenceEngine.ts", root)), false, "retired convergence engine remains");
  assert.equal(existsSync(new URL("../lib/consciousness-types.ts", root)), false, "retired consciousness model remains");
  assert.equal(existsSync(new URL("../lib/recursion-types.ts", root)), false, "retired recursion model remains");
  assert.equal(existsSync(new URL("../hooks/useResonanceEngine.ts", root)), false, "retired resonance inference remains");
  assert.equal(existsSync(new URL("../hooks/useEmotionOverlay.ts", root)), false, "retired emotion attachment inference remains");
  assert.equal(existsSync(new URL("../hooks/useMemoryPersonality.ts", root)), false, "retired relationship inference remains");
  assert.equal(existsSync(new URL("../hooks/useDigitalEntity.ts", root)), false, "retired digital entity model remains");
  assert.equal(existsSync(new URL("../hooks/useDissolutionV8.ts", root)), false, "retired autonomous ecosystem loop remains");
  assert.equal(existsSync(new URL("../lib/entity-types.ts", root)), false, "retired digital entity types remain");
  assert.equal(existsSync(new URL("../../../components/world/WorldShell.tsx", root)), false, "retired world shell remains");
  assert.equal(existsSync(new URL("../../../components/world/HomeV3.tsx", root)), false, "retired world home remains");
  assert.equal(existsSync(new URL("../../../components/world/MemoryEntity.tsx", root)), false, "retired world entity remains");
  assert.equal(existsSync(new URL("../../../components/world/SoulSilhouette.tsx", root)), false, "retired world silhouette remains");
  assert.equal(existsSync(new URL("../../core/personality/personality-core.ts", root)), false, "retired personality evolution remains");
  assert.equal(existsSync(new URL("../../core/personality/entity-personality-core.ts", root)), false, "retired entity personality remains");
  assert.equal(existsSync(new URL("../../../_create_dream.js", root)), false, "retired world generator remains");
  assert.equal(existsSync(new URL("../../../_create_mementity.js", root)), false, "retired entity generator remains");
});
