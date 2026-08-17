const { cpSync, existsSync } = require("node:fs");
const path = require("node:path");

const { packageStandaloneRuntime } = require("./standalone-runtime-layout.cjs");

const root = path.resolve(__dirname, "../..");
const outputDirectory = process.env.STANDALONE_RC_OUTPUT
  ? path.resolve(process.env.STANDALONE_RC_OUTPUT)
  : path.join(root, ".next", "standalone-rc");

const result = packageStandaloneRuntime({
  standaloneDirectory: path.join(root, ".next", "standalone"),
  outputDirectory,
  publicDirectory: path.join(root, "public"),
  staticDirectory: path.join(root, ".next", "static"),
});

// A standalone tree produced on a developer workstation contains that
// workstation's optional native packages.  Preserve the immutable lockfile
// and the target preparation entrypoint in the release payload so the final
// production dependency tree can be constructed on its Linux target.
for (const file of ["package.json", "package-lock.json"]) {
  const source = path.join(root, file);
  if (!existsSync(source)) throw new Error(`STANDALONE_RELEASE_INPUT_MISSING:${source}`);
  cpSync(source, path.join(outputDirectory, file));
}
cpSync(
  path.join(__dirname, "prepare-linux-standalone-runtime.cjs"),
  path.join(outputDirectory, "prepare-linux-standalone-runtime.cjs"),
);

console.log(`STANDALONE_RC_PACKAGED serverEntry=${result.serverEntry}`);
