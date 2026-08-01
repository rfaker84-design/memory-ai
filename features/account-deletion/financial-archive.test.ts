import assert from "node:assert/strict";
import test from "node:test";

import { assertIsolatedArchiveDatabase, FinancialArchiveConfigurationError } from "./financial-archive";

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
