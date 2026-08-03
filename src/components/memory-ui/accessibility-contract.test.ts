import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const globalCss = readFileSync("app/globals.css", "utf8");
const input = readFileSync("src/components/memory-ui/MemoryInput.tsx", "utf8");
const button = readFileSync("src/components/memory-ui/MemoryButton.tsx", "utf8");
const card = readFileSync("src/components/memory-ui/MemoryCard.tsx", "utf8");
const flowStyles = readFileSync("src/components/first-presence/FirstPresenceFlow.module.css", "utf8");

test("core input controls preserve keyboard focus and expose validation to assistive technology", () => {
  assert.match(globalCss, /:focus-visible\s*\{\s*outline: 3px solid/);
  assert.match(input, /useId/);
  assert.match(input, /"aria-invalid"/);
  assert.match(input, /"aria-describedby"/);
  assert.doesNotMatch(input, /outline:\s*"none"/);
});

test("core interaction targets meet the minimum touch target and reduced-motion contracts", () => {
  assert.match(globalCss, /button, a\[role="button"\], \.clickable \{ min-height:44px; min-width:44px; \}/);
  assert.match(button, /useReducedMotion/);
  assert.match(flowStyles, /\.loginAgreement \{[^}]*min-height: 44px/);
  assert.match(flowStyles, /\.trustCheck \{[^}]*min-height: 44px/);
  assert.match(flowStyles, /@media \(prefers-reduced-motion: reduce\)/);
});

test("clickable cards retain button semantics and keyboard activation", () => {
  assert.match(card, /const keyboardInteractive = interactive && typeof onClick === "function"/);
  assert.match(card, /role=\{keyboardInteractive \? role \?\? "button" : role\}/);
  assert.match(card, /tabIndex=\{keyboardInteractive \? tabIndex \?\? 0 : tabIndex\}/);
  assert.match(card, /event\.key !== "Enter" && event\.key !== " "/);
  assert.match(card, /event\.currentTarget\.click\(\)/);
});
