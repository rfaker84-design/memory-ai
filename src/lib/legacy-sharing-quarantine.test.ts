import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { copyShareLink, generateShareCard, getDefaultShareText, getShareCard, trackReferral } from "./share";
import { generateOGTags, generateShareUrl, optimizeForPlatform } from "./socialOptimizer";

test("retired chat-share helpers cannot create public content, write referrals, or copy a historical link", async () => {
  assert.equal(await generateShareCard("memory", "unconfirmed chat"), null);
  assert.equal(await getShareCard("card"), null);
  assert.equal(await trackReferral("card", "user"), false);
  assert.equal(await copyShareLink("card"), false);
  assert.match(getDefaultShareText("TA", "text"), /正式影像流程/);
});

test("retired social helpers remove user-bearing URLs and engagement formatting", () => {
  assert.equal(generateShareUrl("memory", "user", "channel", "variant"), "");
  assert.deepEqual(optimizeForPlatform("xiaohongshu", { title: "title", description: "description", hashtags: ["#x"] }), { title: "", description: "", hashtags: [] });
  assert.deepEqual(generateOGTags({ title: "title", description: "description", imageUrl: "image", pageUrl: "page" }), { title: "", description: "", image: "", url: "", siteName: "", type: "", twitterCard: "" });
});

test("legacy sharing modules do not retain the retired endpoint, public route, user query, or clipboard side effects", () => {
  const share = readFileSync(new URL("./share.ts", import.meta.url), "utf8");
  const social = readFileSync(new URL("./socialOptimizer.ts", import.meta.url), "utf8");
  assert.doesNotMatch(share, /api\/share\/generate|navigator\.clipboard|window\.location/);
  assert.doesNotMatch(social, /\/share\/|[?&]ref=|NEXT_PUBLIC_SITE_URL|hashtags.*#|window\.|document\./i);
});
