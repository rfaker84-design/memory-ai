import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(new URL("./account-data-export-service.ts", import.meta.url), "utf8");

test("account export lists only existing owner-authorized media and saveable approved videos", () => {
  assert.match(source, /'downloadEndpoint', '\/api\/media\/'/);
  assert.match(source, /'saveAllowed', j\.save_allowed/);
  assert.match(source, /j\.save_allowed=true AND j\.artifact_key IS NOT NULL AND j\.status='succeeded'/);
  assert.match(source, /\/first-presence-video\//);
  assert.match(source, /首次不可保存影像不会因为导出而获得下载权/);
  assert.doesNotMatch(source, /'provider', j\.provider/);
});
