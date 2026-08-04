import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("export and account deletion offer a non-diagnostic assistance exit after a confirmed high-risk block", () => {
  for (const path of [
    "src/components/account-data-export/AccountDataExportPanel.tsx",
    "src/components/account-deletion/AccountDeletionPanel.tsx",
    "app/settings/video-shares/page.tsx",
    "src/components/payment/RefundCenter.tsx",
  ]) {
    const source = readFileSync(path, "utf8");
    assert.match(source, /UNDERSTANDING_ASSISTANCE_REQUIRED/);
    assert.match(source, /\/settings\/understanding-assistance/);
    assert.match(source, /\\u4e0d\\u4f1a\\u81ea\\u52a8\\u8054\\u7cfb/);
    assert.doesNotMatch(source, /心智能力不足|心智不健全|精神异常/);
  }
});
