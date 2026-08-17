const { execFileSync } = require("node:child_process");
const { existsSync } = require("node:fs");
const path = require("node:path");

function fail(code, detail) {
  throw new Error(`${code}:${detail}`);
}

if (process.platform !== "linux" || process.arch !== "x64") {
  fail("LINUX_X64_RUNTIME_REQUIRED", `${process.platform}/${process.arch}`);
}

const runtime = process.cwd();
for (const file of ["package.json", "package-lock.json"]) {
  if (!existsSync(path.join(runtime, file))) fail("RUNTIME_INSTALL_INPUT_MISSING", file);
}

// npm ci clears the inherited host node_modules and reconstructs the complete
// production tree from the checked-in lockfile.  Explicitly including optional
// dependencies is required because sharp selects its @img native packages from
// that optional closure on the target platform.
const embeddedNpmCli = path.resolve(
  path.dirname(process.execPath),
  "..",
  "lib",
  "node_modules",
  "npm",
  "bin",
  "npm-cli.js",
);
if (!existsSync(embeddedNpmCli)) fail("RUNTIME_NPM_MISSING", embeddedNpmCli);

execFileSync(process.execPath, [embeddedNpmCli,
  "ci",
  "--omit=dev",
  "--include=optional",
  "--ignore-scripts",
  "--os=linux",
  "--cpu=x64",
  "--libc=glibc",
], { cwd: runtime, stdio: "inherit" });

for (const moduleName of ["sharp", "@img/colour", "@img/sharp-linux-x64", "@img/sharp-libvips-linux-x64"]) {
  if (!existsSync(path.join(runtime, "node_modules", ...moduleName.split("/")))) {
    fail("LINUX_SHARP_RUNTIME_MISSING", moduleName);
  }
}

const sharp = require(path.join(runtime, "node_modules", "sharp"));
console.log(`LINUX_STANDALONE_RUNTIME_READY sharp=${sharp.versions.sharp} vips=${sharp.versions.vips}`);
