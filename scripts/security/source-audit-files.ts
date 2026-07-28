import { execFileSync } from "node:child_process";
import { readdirSync } from "node:fs";
import path from "node:path";

const GENERATED_DIRECTORIES = new Set([
  ".git",
  ".next",
  ".turbo",
  "coverage",
  "dist",
  "node_modules",
  "out",
]);

function relativePosix(root: string, candidate: string): string {
  return path.relative(root, candidate).split(path.sep).join("/");
}

function isRealEnvironmentFile(name: string): boolean {
  return name === ".env" || /^\.env\.(?!example$)/.test(name);
}

function archiveSourceFiles(root: string): string[] {
  const files: string[] = [];

  const visit = (directory: string) => {
    for (const entry of readdirSync(directory, { withFileTypes: true }).sort((left, right) => left.name.localeCompare(right.name))) {
      if (entry.isDirectory()) {
        if (!GENERATED_DIRECTORIES.has(entry.name)) visit(path.join(directory, entry.name));
        continue;
      }
      if (!entry.isFile()) continue;
      if (isRealEnvironmentFile(entry.name)) {
        throw new Error(`SOURCE_AUDIT_REAL_ENVIRONMENT_FILE:${relativePosix(root, path.join(directory, entry.name))}`);
      }
      files.push(relativePosix(root, path.join(directory, entry.name)));
    }
  };

  visit(root);
  return files.sort();
}

/**
 * Lists every source file to audit. A checkout uses Git's tracked-file view;
 * a source archive has no .git directory, so it instead walks the archive in
 * a stable order while rejecting real environment files and generated trees.
 */
export function sourceAuditFiles(root: string = process.cwd()): string[] {
  try {
    const output = execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard", "-z"], {
      cwd: root,
      encoding: "buffer",
      stdio: ["ignore", "pipe", "ignore"],
    });
    return output
      .toString("utf8")
      .split("\0")
      .filter(Boolean)
      .sort();
  } catch {
    return archiveSourceFiles(root);
  }
}

export function sourceAuditRouteFiles(root: string = process.cwd()): string[] {
  return sourceAuditFiles(root).filter((file) => /^app\/api\/.+\/route\.ts$/.test(file));
}
