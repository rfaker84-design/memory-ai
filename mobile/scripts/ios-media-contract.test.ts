import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync("ios/App/App/AppDelegate.swift", "utf8");

test("iOS media plugin fulfills the shared upload contract without accepting arbitrary files", () => {
  assert.match(source, /CAPPluginMethod\(name: "readMedia", returnType: CAPPluginReturnPromise\)/);
  assert.match(source, /@objc func readMedia\(_ call: CAPPluginCall\)/);
  assert.match(source, /source\.isFileURL/);
  assert.match(source, /temporaryDirectory\.path \+ "\/"/);
  assert.match(source, /maximumImageBytes = 20 \* 1024 \* 1024/);
  assert.match(source, /supportedImageMimeType\(contentType\)/);
  assert.match(source, /Data\(contentsOf: file, options: \.mappedIfSafe\)/);
  assert.match(source, /data\.count == sizeBytes/);
  assert.match(source, /call\.reject\("UNSUPPORTED_MEDIA_URI"\)/);
});

test("iOS picker advertises only image types accepted by the shared uploader", () => {
  assert.match(source, /config\.filter = \.images/);
  assert.match(source, /\["image\/jpeg", "image\/png", "image\/webp"\]/);
  assert.match(source, /call\.reject\("UNSUPPORTED_MEDIA_TYPE"\)/);
});
