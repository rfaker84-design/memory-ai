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

console.log(`STANDALONE_RC_PACKAGED serverEntry=${result.serverEntry}`);
