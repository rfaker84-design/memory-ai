import assert from "node:assert/strict";
import test from "node:test";

import { accountDeletionRetentionPolicy } from "./account-deletion-policy";

test("account deletion deadlines are configurable but cannot exceed 7/30/90 policy maxima", () => {
  assert.deepEqual(accountDeletionRetentionPolicy({}), { contentDays: 7, providerDays: 30, backupDays: 90 });
  assert.deepEqual(accountDeletionRetentionPolicy({ ACCOUNT_DELETION_CONTENT_RETENTION_DAYS: "3", ACCOUNT_DELETION_PROVIDER_RETENTION_DAYS: "12", ACCOUNT_DELETION_BACKUP_RETENTION_DAYS: "45" }), { contentDays: 3, providerDays: 12, backupDays: 45 });
  assert.throws(() => accountDeletionRetentionPolicy({ ACCOUNT_DELETION_CONTENT_RETENTION_DAYS: "8" }));
  assert.throws(() => accountDeletionRetentionPolicy({ ACCOUNT_DELETION_CONTENT_RETENTION_DAYS: "7", ACCOUNT_DELETION_PROVIDER_RETENTION_DAYS: "6" }));
});
