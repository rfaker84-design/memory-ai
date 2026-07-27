import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const experience = readFileSync("src/components/memorial-preview/MemorialPreviewExperience.tsx", "utf8");
const styles = readFileSync("src/components/memorial-preview/MemorialPreviewExperience.module.css", "utf8");
const home = readFileSync("app/page.tsx", "utf8");
const acceptance = readFileSync("app/sprint21-core-experience/page.tsx", "utf8");
const worldShell = readFileSync("components/world/WorldShell.tsx", "utf8");

test("phone verification gates the personal free experience before photo generation", () => {
  assert.match(experience, /useState<PreviewStage>\("phone"\)/);
  assert.match(experience, /个人免费体验/);
  assert.match(experience, /\/api\/auth\/send-code/);
  assert.match(experience, /\/api\/auth\/verify-code/);
  assert.match(experience, /setStage\("upload"\)/);
  assert.match(experience, /验收演示不会发送真实短信/);
  assert.match(worldShell, /手机号验证后，生成 10 秒预览/);
  assert.doesNotMatch(experience, /生成后再次要求登录|登录后保存|onRequestAccount/);
});

test("photo remains quality-gated, local-only, and hidden before the dynamic demo", () => {
  assert.match(experience, /上传 TA 的照片/);
  assert.match(experience, /assessPhotoFile\(file\)/);
  assert.match(experience, /不会先展示照片/);
  assert.match(experience, /照片只在当前设备完成本次演示/);
  assert.doesNotMatch(experience, /localStorage|sessionStorage|recordTrustConsent/);
  assert.doesNotMatch(experience, /\/api\/(?:media|video|payments|credits)/);
});

test("ten-second portrait demo is explicit and exposes no action before playback completes", () => {
  assert.match(experience, /const PREVIEW_DURATION_MS = 10_000/);
  assert.match(experience, /动态效果演示/);
  assert.match(experience, /非真实 AI 生成视频/);
  assert.match(styles, /aspect-ratio: 9 \/ 16/);
  assert.match(styles, /animation: portraitTakeOne 10s/);
  assert.match(experience, /setStage\("retention"\)/);
  assert.doesNotMatch(experience, /audio|voice|speech|lip/i);

  const revealOnly = experience.slice(
    experience.indexOf('{stage === "reveal" && ('),
    experience.indexOf('{stage === "retention" && ('),
  );
  assert.doesNotMatch(revealOnly, /<button|choicePanel|saveSheet/);
});

test("retention comes first, then share opportunity and purchase plans", () => {
  assert.match(experience, /留住这段影像/);
  assert.match(experience, /分享获得体验机会/);
  assert.match(experience, /查看购买方案/);
  assert.match(experience, /留住这一段/);
  assert.match(experience, /纪念影像小集/);
  assert.match(experience, /验收演示不会创建订单或发起付款/);
  assert.doesNotMatch(experience, /49元|立即购买|登录后保存/);
});

test("library keeps one portrait as the only visual center and uses natural language", () => {
  assert.match(experience, /刚刚的 10 秒/);
  assert.match(experience, /演示预览/);
  assert.match(experience, /未保存/);
  assert.doesNotMatch(experience, /newTake|第一次出现/);
  assert.match(styles, /\.libraryGrid[\s\S]*width: min\(100%, 21rem\)/);
  assert.doesNotMatch(styles, /\.newTake/);
});

test("public home and dedicated acceptance route both expose the corrected experience", () => {
  assert.match(home, /MemorialPreviewExperience/);
  assert.match(acceptance, /acceptanceMode/);
  assert.match(acceptance, /MemorialPreviewExperience/);
});

test("mobile safe areas and reduced motion remain first-class", () => {
  assert.match(styles, /env\(safe-area-inset-top\)/);
  assert.match(styles, /env\(safe-area-inset-bottom\)/);
  assert.match(styles, /@media \(max-width: 760px\)/);
  assert.match(styles, /\.verifyScene[\s\S]*min-height: calc\(100dvh/);
  assert.match(styles, /@media \(prefers-reduced-motion: reduce\)/);
});
