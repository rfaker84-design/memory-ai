import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { assertFinancialArchiveConfiguration, assertIsolatedArchiveDatabase, FinancialArchiveConfigurationError } from "./financial-archive";

const key = "financial-archive-test-key-with-at-least-32-bytes";

test("financial archive accepts both supported PostgreSQL URL schemes for separate databases", () => {
  for (const scheme of ["postgres", "postgresql"]) {
    const archive = `${scheme}://postgres@127.0.0.1:55432/financial_archive`;
    assert.equal(assertIsolatedArchiveDatabase({
      DATABASE_URL: "postgres://postgres@127.0.0.1:55432/application",
      ACCOUNT_DELETION_FINANCIAL_ARCHIVE_DATABASE_URL: archive,
      ACCOUNT_DELETION_FINANCIAL_ARCHIVE_HMAC_KEY: key,
    }), archive);
  }
});

test("financial archive rejects a shared database even when URL schemes differ", () => {
  assert.throws(() => assertIsolatedArchiveDatabase({
    DATABASE_URL: "postgres://postgres@127.0.0.1:55432/application",
    ACCOUNT_DELETION_FINANCIAL_ARCHIVE_DATABASE_URL: "postgresql://postgres@127.0.0.1:55432/application",
    ACCOUNT_DELETION_FINANCIAL_ARCHIVE_HMAC_KEY: key,
  }), (error: unknown) => error instanceof FinancialArchiveConfigurationError && error.code === "FINANCIAL_ARCHIVE_DATABASE_NOT_ISOLATED");
});

test("financial archive treats an omitted PostgreSQL default port as the same database", () => {
  assert.throws(() => assertIsolatedArchiveDatabase({
    DATABASE_URL: "postgres://postgres@127.0.0.1/application",
    ACCOUNT_DELETION_FINANCIAL_ARCHIVE_DATABASE_URL: "postgresql://postgres@127.0.0.1:5432/application",
    ACCOUNT_DELETION_FINANCIAL_ARCHIVE_HMAC_KEY: key,
  }), (error: unknown) => error instanceof FinancialArchiveConfigurationError && error.code === "FINANCIAL_ARCHIVE_DATABASE_NOT_ISOLATED");
});

test("financial archive startup validation rejects incomplete or unsafe archive settings", () => {
  const valid = {
    DATABASE_URL: "postgres://postgres@127.0.0.1:55432/application",
    ACCOUNT_DELETION_FINANCIAL_ARCHIVE_DATABASE_URL: "postgres://postgres@127.0.0.1:55432/financial_archive",
    ACCOUNT_DELETION_FINANCIAL_ARCHIVE_HMAC_KEY: key,
    ACCOUNT_DELETION_FINANCIAL_RETENTION_DAYS: "1095",
  };
  assert.doesNotThrow(() => assertFinancialArchiveConfiguration(valid));
  for (const environment of [
    { ...valid, ACCOUNT_DELETION_FINANCIAL_ARCHIVE_DATABASE_URL: "" },
    { ...valid, ACCOUNT_DELETION_FINANCIAL_ARCHIVE_HMAC_KEY: "too-short" },
    { ...valid, ACCOUNT_DELETION_FINANCIAL_RETENTION_DAYS: "10951" },
  ]) assert.throws(() => assertFinancialArchiveConfiguration(environment), FinancialArchiveConfigurationError);
});

test("environment template documents the fail-closed isolated financial archive contract", () => {
  const environmentTemplate = readFileSync(".env.example", "utf8");
  for (const entry of [
    "ACCOUNT_DELETION_FINANCIAL_ARCHIVE_DATABASE_URL=",
    "ACCOUNT_DELETION_FINANCIAL_ARCHIVE_DATABASE_SSL=false",
    "ACCOUNT_DELETION_FINANCIAL_ARCHIVE_HMAC_KEY=",
    "ACCOUNT_DELETION_FINANCIAL_RETENTION_DAYS=",
  ]) assert.match(environmentTemplate, new RegExp(`^${entry.replace(/[.*+?^${}()|[\\]\\]/g, "\\$&")}$`, "m"));
  assert.match(environmentTemplate, /compliance-approved isolated archive/i);
  assert.match(environmentTemplate, /external legal and accounting gate/i);
});
