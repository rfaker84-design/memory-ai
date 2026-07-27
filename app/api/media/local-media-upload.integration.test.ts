import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { NextRequest } from "next/server";
import pg from "pg";

import { closePostgresPool } from "../../../src/server/database";
import { AUTH_SESSION_COOKIE } from "../../../src/server/auth/config";
import { issueSession } from "../../../src/server/auth/session";
import { GET as getMedia } from "./[id]/route";
import { POST as uploadMedia } from "./upload/route";

const { Client } = pg;
const adminUrlValue = process.env.MEDIA_LOCAL_GATE_ADMIN_URL;
const gateDatabase = process.env.MEDIA_LOCAL_GATE_DATABASE ?? "media_gate_local_provider";
const migrations = [
  "001_memoryai_core.sql",
  "002_memoryai_indexes.sql",
  "003_memoryai_constraints.sql",
  "004_media_storage_foundation.sql",
  "005_memory_creation_idempotency.sql",
  "006_auth_verification_challenges.sql",
  "007_long_term_memories.sql",
  "008_memory_first_greetings.sql",
  "009_memory_chat_turn_idempotency.sql",
  "010_memory_experience_payments.sql",
  "011_business_funnel_events.sql",
  "012_payment_refund_requests.sql",
  "013_wechat_auth_identities.sql",
];

const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const wav = Buffer.concat([Buffer.from("RIFF"), Buffer.alloc(4), Buffer.from("WAVEfmt ")]);

function assertIsolatedTarget(adminUrl: URL): void {
  assert.match(adminUrl.hostname, /^(127\.0\.0\.1|localhost|::1)$/);
  assert.match(gateDatabase, /^media_gate_[a-z0-9_]+$/);
  assert.equal(process.env.MEDIA_LOCAL_GATE_ALLOW_DROP, "YES");
}

function databaseUrl(adminUrl: URL): string {
  const target = new URL(adminUrl);
  target.pathname = `/${gateDatabase}`;
  return target.toString();
}

async function resetDatabase(adminUrl: URL): Promise<string> {
  const admin = new Client({ connectionString: adminUrl.toString() });
  await admin.connect();
  try {
    await admin.query(
      `SELECT pg_terminate_backend(pid)
       FROM pg_stat_activity
       WHERE datname = $1 AND pid <> pg_backend_pid()`,
      [gateDatabase],
    );
    await admin.query(`DROP DATABASE IF EXISTS "${gateDatabase}"`);
    await admin.query(`CREATE DATABASE "${gateDatabase}"`);
  } finally {
    await admin.end();
  }
  return databaseUrl(adminUrl);
}

async function applyMigrations(url: string): Promise<void> {
  const client = new Client({ connectionString: url });
  await client.connect();
  try {
    for (const file of migrations) {
      await client.query(await readFile(new URL(`../../../database/migrations/${file}`, import.meta.url), "utf8"));
    }
  } finally {
    await client.end();
  }
}

function request(
  memoryId: string,
  session: string,
  name: string,
  type: string,
  body: Buffer,
): NextRequest {
  const form = new FormData();
  form.set("memoryId", memoryId);
  form.set("file", new File([Uint8Array.from(body)], name, { type }));
  return new NextRequest("http://localhost/api/media/upload", {
    method: "POST",
    headers: {
      origin: "http://localhost",
      cookie: `${AUTH_SESSION_COOKIE}=${session}`,
    },
    body: form,
  });
}

test(
  "local media provider gate uploads image and audio through formal routes, restores data, and deduplicates SHA",
  { skip: adminUrlValue ? false : "set MEDIA_LOCAL_GATE_ADMIN_URL to run the destructive local PostgreSQL gate", timeout: 120_000 },
  async () => {
    assert.ok(adminUrlValue);
    const adminUrl = new URL(adminUrlValue);
    assertIsolatedTarget(adminUrl);
    const url = await resetDatabase(adminUrl);
    await applyMigrations(url);
    const root = await mkdtemp(join(tmpdir(), "memoryai-local-media-gate-"));
    const environment = {
      DATABASE_URL: process.env.DATABASE_URL,
      NODE_ENV: process.env.NODE_ENV,
      MEDIA_STORAGE_PROVIDER: process.env.MEDIA_STORAGE_PROVIDER,
      MEDIA_LOCAL_ROOT: process.env.MEDIA_LOCAL_ROOT,
      AUTH_ALLOWED_ORIGIN: process.env.AUTH_ALLOWED_ORIGIN,
      SESSION_SECRET: process.env.SESSION_SECRET,
    };
    const environmentVariables = process.env as Record<string, string | undefined>;
    environmentVariables.DATABASE_URL = url;
    environmentVariables.NODE_ENV = "test";
    environmentVariables.MEDIA_STORAGE_PROVIDER = "local";
    environmentVariables.MEDIA_LOCAL_ROOT = root;
    environmentVariables.AUTH_ALLOWED_ORIGIN = "http://localhost";
    environmentVariables.SESSION_SECRET = "media-local-gate-session-secret-with-at-least-32-bytes";
    await closePostgresPool();

    try {
      const client = new Client({ connectionString: url });
      await client.connect();
      let userId: string;
      let memoryId: string;
      try {
        const user = await client.query<{ id: string }>(
          "INSERT INTO users (external_id) VALUES ('media-local-gate-owner') RETURNING id",
        );
        userId = user.rows[0].id;
        const memory = await client.query<{ id: string }>(
          `INSERT INTO memories (user_id, name, idempotency_key, creation_idempotency_key)
           VALUES ($1, 'Local media gate', $2, $3) RETURNING id`,
          [userId, "a".repeat(64), "local-media-gate-creation-key"],
        );
        memoryId = memory.rows[0].id;
      } finally {
        await client.end();
      }

      const session = await issueSession({ userId, externalUserId: "media-local-gate-owner" });
      const image = await uploadMedia(request(memoryId, session, "portrait.png", "image/png", png));
      assert.equal(image.status, 201);
      const imageBody = await image.json() as { asset: { id: string; status: string }; duplicate: boolean };
      assert.equal(imageBody.asset.status, "uploaded");
      assert.equal(imageBody.duplicate, false);

      const duplicate = await uploadMedia(request(memoryId, session, "portrait.png", "image/png", png));
      assert.equal(duplicate.status, 200);
      const duplicateBody = await duplicate.json() as { asset: { id: string }; duplicate: boolean };
      assert.equal(duplicateBody.duplicate, true);
      assert.equal(duplicateBody.asset.id, imageBody.asset.id);

      const audio = await uploadMedia(request(memoryId, session, "voice.wav", "audio/wav", wav));
      assert.equal(audio.status, 201);
      const audioBody = await audio.json() as { asset: { id: string; mediaType: string; status: string } };
      assert.equal(audioBody.asset.mediaType, "audio");
      assert.equal(audioBody.asset.status, "uploaded");

      const restored = await getMedia(
        new NextRequest(`http://localhost/api/media/${imageBody.asset.id}`, {
          headers: { cookie: `${AUTH_SESSION_COOKIE}=${session}` },
        }),
        { params: Promise.resolve({ id: imageBody.asset.id }) },
      );
      assert.equal(restored.status, 200);
      const restoredBody = await restored.json() as { asset: { id: string; status: string }; url: string };
      assert.equal(restoredBody.asset.id, imageBody.asset.id);
      assert.equal(restoredBody.asset.status, "uploaded");
      assert.equal(restoredBody.url, `data:image/png;base64,${png.toString("base64")}`);

      const inspect = new Client({ connectionString: url });
      await inspect.connect();
      try {
        const rows = await inspect.query<{ count: string; storage_key: string }>(
          `SELECT COUNT(*)::text AS count, MIN(storage_key) AS storage_key
           FROM media_assets
           WHERE memory_id = $1 AND media_type = 'image' AND status = 'uploaded'`,
          [memoryId],
        );
        assert.equal(rows.rows[0].count, "1");
        assert.ok(rows.rows[0].storage_key);
      } finally {
        await inspect.end();
      }
    } finally {
      await closePostgresPool();
      await rm(root, { recursive: true, force: true });
      for (const [name, value] of Object.entries(environment)) {
        if (value === undefined) delete environmentVariables[name];
        else environmentVariables[name] = value;
      }
    }
  },
);
