import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import { chmod, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { pipeline } from "node:stream/promises";

export type MigrationState = Record<string, number>;

export function flag(name: string): boolean {
  return process.argv.includes(`--${name}`);
}

export function option(name: string): string | undefined {
  const prefix = `--${name}=`;
  return process.argv.find((argument) => argument.startsWith(prefix))?.slice(prefix.length);
}

export async function ensurePrivateDirectory(path: string) {
  await mkdir(path, { recursive: true, mode: 0o700 });
  await chmod(path, 0o700);
}

export async function readState(path: string): Promise<MigrationState> {
  try {
    return JSON.parse(await readFile(path, "utf8")) as MigrationState;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return {};
    throw error;
  }
}

export async function writeState(path: string, state: MigrationState) {
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  await writeFile(path, `${JSON.stringify(state, null, 2)}\n`, { mode: 0o600 });
  await chmod(path, 0o600);
}

function encryptionKey(): Buffer | null {
  const value = process.env.MIGRATION_EXPORT_KEY;
  return value ? createHash("sha256").update(value).digest() : null;
}

export async function encryptFile(path: string): Promise<string | null> {
  const key = encryptionKey();
  if (!key) return null;

  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const encryptedPath = `${path}.enc`;
  const output = createWriteStream(encryptedPath, { mode: 0o600 });
  output.write(Buffer.from("MAI1"));
  output.write(iv);
  await pipeline(createReadStream(path), cipher, output, { end: false });
  output.end(cipher.getAuthTag());
  await new Promise<void>((resolve, reject) => {
    output.once("close", resolve);
    output.once("error", reject);
  });
  await chmod(encryptedPath, 0o600);
  await rm(path, { force: true });
  return encryptedPath;
}

export async function decryptFile(path: string, outputPath: string): Promise<void> {
  const key = encryptionKey();
  if (!key) throw new Error("MIGRATION_EXPORT_KEY is required for encrypted input");

  const source = await readFile(path);
  if (source.subarray(0, 4).toString("utf8") !== "MAI1" || source.length < 32) {
    throw new Error("Encrypted migration file header is invalid");
  }

  const iv = source.subarray(4, 16);
  const tag = source.subarray(source.length - 16);
  const encrypted = source.subarray(16, source.length - 16);
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  const plain = Buffer.concat([decipher.update(encrypted), decipher.final()]);
  await writeFile(outputPath, plain, { mode: 0o600 });
  await chmod(outputPath, 0o600);
}

export function stableHash(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

export function safeSummary(label: string, values: Record<string, unknown>) {
  console.log(`${label} ${JSON.stringify(values)}`);
}
