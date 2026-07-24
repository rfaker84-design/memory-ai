const path = require("node:path");

const { assertManifestEntryResolves } = require("./standalone-runtime-layout.cjs");

const runtimeDirectory = __dirname;
const { entryPath, applicationDirectory } = assertManifestEntryResolves(runtimeDirectory);

process.chdir(applicationDirectory);
process.argv = [process.argv0, entryPath, ...process.argv.slice(2)];
require(entryPath);
