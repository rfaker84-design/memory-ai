import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const api = readFileSync(new URL("./api.ts", import.meta.url), "utf8");
const app = readFileSync(new URL("../App.tsx", import.meta.url), "utf8");

test("mobile photo-led pickup uses only the formal current-TA source list and explicit confirmation", () => {
  assert.match(api, /type ProductPickupPhotoSource/);
  assert.match(api, /\/pickup-photo-sources/);
  assert.match(api, /\/api\/media\/\$\{encodeURIComponent\(assetId\)\}/);
  assert.match(api, /photoAssetId\?: string \| null/);
  assert.match(api, /body: JSON\.stringify\(\{ \.\.\.input, confirmed: true \}\)/);
  assert.match(app, /productApi\.listPickupPhotoSources\(memory\.id\)/);
  assert.match(app, /selectedPickupPhotoAssetId/);
  assert.match(app, /productApi\.getMediaPreviewUrl\(photo\.id\)/);
  assert.match(app, /pickupPhotoPreviewUrls\[photo\.id\]/);
  assert.match(app, /referrerPolicy="no-referrer"/);
  assert.match(app, /photoAssetId: selectedPickupPhotoAssetId/);
  assert.match(app, /!editingPickupId && selectedPickupPhotoAssetId/);
  assert.match(app, /const editPickup[\s\S]*?setSelectedPickupPhotoAssetId\(null\)/);
  assert.match(app, /不会读取相册、麦克风或录音/);
  assert.match(app, /pickup\.photoAssetId/);
});
