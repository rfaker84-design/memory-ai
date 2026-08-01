const path = require("node:path");

const { assertManifestEntryResolves } = require("./standalone-runtime-layout.cjs");
const { assertProductionRuntimeContract } = require("./production-runtime-contract.cjs");

const runtimeDirectory = __dirname;
const { entryPath, applicationDirectory } = assertManifestEntryResolves(runtimeDirectory);

// Validate before loading Next or binding a port: an incomplete formal runtime
// must never look ready and then fail only on its first request.
assertProductionRuntimeContract(process.env);
process.chdir(applicationDirectory);
process.argv = [process.argv0, entryPath, ...process.argv.slice(2)];
require(entryPath);
