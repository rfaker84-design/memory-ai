const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "..", "..");
const packageJson = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));

test("launch candidate excludes unreachable heavy-3D dependencies and source modules", () => {
  for (const dependency of ["@react-three/drei", "@react-three/fiber", "@react-three/postprocessing", "postprocessing", "three"]) {
    assert.equal(packageJson.dependencies?.[dependency], undefined, `${dependency} must not ship in the launch dependency set`);
  }
  for (const file of [
    path.join(root, "src", "components", "3d", "UniverseScene.tsx"),
    path.join(root, "src", "components", "3d", "MemoryWorldScene.tsx"),
    path.join(root, "lib", "camera", "cinematic-camera-controller.ts"),
    path.join(root, "lib", "universe", "semantic-map.ts"),
  ]) assert.equal(fs.existsSync(file), false, `${file} must remain retired`);
  assert.equal(fs.existsSync(path.join(root, "src", "components", "SplashScreenV2.tsx")), false);
});
