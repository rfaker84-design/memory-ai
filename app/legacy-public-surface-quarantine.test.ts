import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

function source(path: string) {
  return readFileSync(path, "utf8");
}

test("historical entry aliases redirect on the server and cannot render a JavaScript-dependent blank screen", () => {
  for (const path of ["app/landing/page.tsx", "app/onboarding/page.tsx", "app/avatar-center/page.tsx"]) {
    const page = source(path);
    assert.match(page, /import \{ redirect \} from "next\/navigation"/);
    assert.match(page, /redirect\("\/"\)/);
    assert.doesNotMatch(page, /"use client"|useEffect|useRouter/);
  }
});

test("unsafe historical deep links stay behind approved routes rather than reintroducing legacy capability surfaces", () => {
  for (const path of ["app/avatar/[id]/page.tsx", "app/heirloom/[id]/page.tsx", "app/share/[id]/page.tsx"]) {
    assert.match(source(path), /redirect\("\/"\)/);
  }
  assert.match(source("app/voice-chat/[id]/page.tsx"), /redirect\(`\/memory-chat\/\$\{encodeURIComponent\(id\)\}`\)/);
  assert.match(source("app/(dialogue)/dialogue/page.tsx"), /redirect\(memoryId \? `\/memory-chat/);
  assert.match(source("app/memory/[id]/long-term-memory/page.tsx"), /redirect\(`\/memory\/\$\{encodeURIComponent\(id\)\}\/pickup`\)/);
});
