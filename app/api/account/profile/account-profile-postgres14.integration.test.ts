import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { NextRequest } from "next/server";
import pg from "pg";

import { closePostgresPool } from "../../../../src/server/database";
import { AUTH_SESSION_COOKIE } from "../../../../src/server/auth/config";
import { issueSession } from "../../../../src/server/auth/session";
import { createAccountProfileHandlers } from "./_handler";

const { Client } = pg;
const adminUrlValue = process.env.ACCOUNT_PROFILE_POSTGRES_GATE_ADMIN_URL;
const databaseName = process.env.ACCOUNT_PROFILE_POSTGRES_GATE_DATABASE
  ?? `account_profile_gate_${randomUUID().replaceAll("-", "").slice(0, 16)}`;
const origin = "https://memoryai.test";

function assertIsolatedTarget(adminUrl: URL): void {
  assert.match(adminUrl.hostname, /^(127\.0\.0\.1|localhost|::1)$/);
  assert.match(databaseName, /^account_profile_gate_[a-z0-9_]+$/);
  assert.equal(process.env.ACCOUNT_PROFILE_POSTGRES_GATE_ALLOW_DROP, "YES");
}

function targetUrl(adminUrl: URL): string {
  const target = new URL(adminUrl);
  target.pathname = `/${databaseName}`;
  target.searchParams.set("application_name", "memoryai-account-profile-pg14-gate");
  return target.toString();
}

async function assertNoConnections(admin: InstanceType<typeof Client>): Promise<void> {
  const result = await admin.query<{ count: number }>(
    "SELECT count(*)::int AS count FROM pg_stat_activity WHERE datname=$1::text AND pid <> pg_backend_pid()",
    [databaseName],
  );
  assert.equal(result.rows[0]?.count, 0);
}

function profileRequest(method: "GET" | "PATCH", session: string, birthDate?: string): NextRequest {
  return new NextRequest(`${origin}/api/account/profile`, {
    method,
    headers: {
      origin,
      cookie: `${AUTH_SESSION_COOKIE}=${session}`,
      ...(birthDate ? { "content-type": "application/json" } : {}),
    },
    body: birthDate ? JSON.stringify({ birthDate }) : undefined,
  });
}

test("account profile PATCH persists and refreshes an Owner-isolated birth date on PostgreSQL 14.23", {
  skip: adminUrlValue ? false : "set ACCOUNT_PROFILE_POSTGRES_GATE_ADMIN_URL for the isolated PG14 gate",
  timeout: 120_000,
}, async () => {
  assert.ok(adminUrlValue);
  const adminUrl = new URL(adminUrlValue);
  assertIsolatedTarget(adminUrl);
  const admin = new Client({ connectionString: adminUrl.toString() });
  const url = targetUrl(adminUrl);
  const environment = new Map([
    "DATABASE_URL",
    "DATABASE_SSL",
    "DATABASE_POOL_MAX",
    "NODE_ENV",
    "AUTH_ALLOWED_ORIGIN",
    "SESSION_SECRET",
    "AUTH_SESSION_REVOCATION_ENFORCED",
  ].map((name) => [name, process.env[name]]));
  const environmentVariables = process.env as Record<string, string | undefined>;
  let target: InstanceType<typeof Client> | undefined;

  try {
    await admin.connect();
    assert.match(
      (await admin.query<{ server_version: string }>("SHOW server_version")).rows[0]?.server_version ?? "",
      /^14\.23(?:\D|$)/,
    );
    await admin.query(`CREATE DATABASE "${databaseName}"`);
    target = new Client({ connectionString: url });
    await target.connect();
    for (const migration of ["001_memoryai_core.sql", "002_memoryai_indexes.sql"]) {
      await target.query(await readFile(new URL(`../../../../database/migrations/${migration}`, import.meta.url), "utf8"));
    }

    environmentVariables.DATABASE_URL = url;
    environmentVariables.DATABASE_SSL = "false";
    environmentVariables.DATABASE_POOL_MAX = "2";
    environmentVariables.NODE_ENV = "test";
    environmentVariables.AUTH_ALLOWED_ORIGIN = origin;
    environmentVariables.SESSION_SECRET = "account-profile-pg14-gate-session-secret-0001";
    environmentVariables.AUTH_SESSION_REVOCATION_ENFORCED = "false";
    await closePostgresPool();

    const ownerA = (await target.query<{ id: string }>(
      "INSERT INTO public.users(external_id, profile) VALUES ($1::text, $2::jsonb) RETURNING id",
      ["account-profile-pg14-owner-a", JSON.stringify({ retained: "unchanged" })],
    )).rows[0]!;
    const ownerB = (await target.query<{ id: string }>(
      "INSERT INTO public.users(external_id) VALUES ($1::text) RETURNING id",
      ["account-profile-pg14-owner-b"],
    )).rows[0]!;
    const ownerASession = await issueSession({ userId: ownerA.id, externalUserId: "account-profile-pg14-owner-a" });
    const ownerBSession = await issueSession({ userId: ownerB.id, externalUserId: "account-profile-pg14-owner-b" });
    const handlers = createAccountProfileHandlers();

    const inserted = await handlers.PATCH(profileRequest("PATCH", ownerASession, "1980-06-15"));
    assert.equal(inserted.status, 200);
    assert.deepEqual(await inserted.json(), { birthDate: "1980-06-15", adultEligible: true });

    const updated = await handlers.PATCH(profileRequest("PATCH", ownerASession, "1981-07-16"));
    assert.equal(updated.status, 200);
    assert.deepEqual(await updated.json(), { birthDate: "1981-07-16", adultEligible: true });
    assert.deepEqual((await target.query<{ birth_date: string; retained: string }>(
      "SELECT profile ->> 'birth_date' AS birth_date, profile ->> 'retained' AS retained FROM public.users WHERE id=$1::uuid",
      [ownerA.id],
    )).rows[0], { birth_date: "1981-07-16", retained: "unchanged" });

    await closePostgresPool();
    const refreshed = await handlers.GET(profileRequest("GET", ownerASession));
    assert.equal(refreshed.status, 200);
    assert.deepEqual(await refreshed.json(), { birthDate: "1981-07-16", adultEligible: true });
    const isolated = await handlers.GET(profileRequest("GET", ownerBSession));
    assert.equal(isolated.status, 200);
    assert.deepEqual(await isolated.json(), { birthDate: null, adultEligible: false });

    await closePostgresPool();
    await target.end();
    target = undefined;
    await assertNoConnections(admin);
  } finally {
    await closePostgresPool();
    await target?.end();
    for (const [name, value] of environment) {
      if (value === undefined) delete environmentVariables[name];
      else environmentVariables[name] = value;
    }
    if (adminUrlValue) {
      await admin.query(
        "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname=$1::text AND pid <> pg_backend_pid()",
        [databaseName],
      ).catch(() => undefined);
      await admin.query(`DROP DATABASE IF EXISTS "${databaseName}"`).catch(() => undefined);
    }
    await admin.end().catch(() => undefined);
  }
});
