import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import test from "node:test";

const sourceRoot = process.cwd();
const quarantinedModules = new Set([
  "app/lib/avatar-providers.ts",
  "src/components/ChatBox.tsx",
  "src/components/DialogueLayer.tsx",
  "src/lib/avatar.ts",
  "src/lib/avatarManager.ts",
]);

function publishedSourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return publishedSourceFiles(path);
    if (!/\.(?:ts|tsx)$/.test(entry.name) || entry.name.endsWith(".test.ts") || entry.name.endsWith(".test.tsx")) return [];
    return [relative(sourceRoot, path).replace(/\\/g, "/")];
  });
}

test("published sources cannot reactivate retired avatar, legacy chat, or mock-provider modules", () => {
  const forbiddenImport = /(?:from\s*\(?\s*["'][^"']*|import\s*\(?\s*["'][^"']*)(?:avatar-providers|ChatBox|DialogueLayer|avatarManager|\/avatar)(?:["'./])/;
  const files = [
    ...publishedSourceFiles(join(sourceRoot, "app")),
    ...publishedSourceFiles(join(sourceRoot, "src", "components")),
    ...publishedSourceFiles(join(sourceRoot, "src", "lib")),
  ].filter((file) => !quarantinedModules.has(file));

  for (const file of files) {
    assert.doesNotMatch(readFileSync(join(sourceRoot, file), "utf8"), forbiddenImport, file);
  }
});
