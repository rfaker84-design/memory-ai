# Secondary public pages — visual QA

## Reference and implementation evidence

All comparisons use the approved mobile references scaled to 390×844 beside a live local implementation at the same viewport.

| Page | Approved reference | Live implementation | Comparison |
| --- | --- | --- | --- |
| `/guest/companion` | `evidence/approved-secondary-pages-20260826-extracted/yijian-secondary-pages-approved-2026-08-26/01-companion-approved.png` | `evidence/staging-secondary-pages-20260827/local-mobile-companion-v3.png` | `evidence/staging-secondary-pages-20260827/compare-companion-v3.png` |
| `/guest/memories` | `evidence/approved-secondary-pages-20260826-extracted/yijian-secondary-pages-approved-2026-08-26/02-memories-approved.png` | `evidence/staging-secondary-pages-20260827/local-mobile-memories-v3.png` | `evidence/staging-secondary-pages-20260827/compare-memories-v3.png` |
| `/guest/create` | `evidence/approved-secondary-pages-20260826-extracted/yijian-secondary-pages-approved-2026-08-26/03-create-approved.png` | `evidence/staging-secondary-pages-20260827/local-mobile-create-v3.png` | `evidence/staging-secondary-pages-20260827/compare-create-v3.png` |
| `/guest/account` | `evidence/approved-secondary-pages-20260826-extracted/yijian-secondary-pages-approved-2026-08-26/04-account-approved.png` | `evidence/staging-secondary-pages-20260827/local-mobile-account-v3.png` | `evidence/staging-secondary-pages-20260827/compare-account-v3.png` |

Desktop 1440×1024 evidence is in `evidence/staging-secondary-pages-20260827/local-desktop-*-v1.png`.

## Inspection result

- `companion`: immersive live public synthetic video, the approved hierarchy, disclosure, composer and fixed navigation are present. The person’s live video phase differs from the reference still, as intended; no new media was generated.
- `memories`: photo-led three-item timeline, warm paper density and contextual add action match the approved structure; all three items and the action remain visible above the fixed mobile navigation.
- `create`: empty-frame scene, two local-only fields and the upload login boundary match the approved first step. No upload control or persistence is mounted before login.
- `account`: album-and-envelope hero, guest status, login and five service links match the approved hierarchy.
- All four pages have no horizontal overflow at 390×844 or 1440×1024. No P0, P1, or P2 discrepancy remained after the second visual pass.

## Interaction evidence

- Create upload boundary: `evidence/staging-secondary-pages-20260827/local-mobile-create-contextual-login-v1.png`; closing the panel retained the entered local name and relationship.
- Companion send boundary: `evidence/staging-secondary-pages-20260827/local-mobile-companion-contextual-login-v1.png`; closing the panel returned to the public companion surface.

Final result: passed

---

# Miniature soundscape player — visual QA

**Comparison Target**

- Source visual truth: `/workspace/scratch/af3d1e33d6a8/generated_images/exec-24bd6156-02a1-4448-a859-17adef7a3f85.png`
- Source pixels: `853 × 1844`
- Implementation route: `http://terminal.local:4173/`
- Intended implementation viewports: `390 × 844` mobile and `1360 × 936` desktop at device scale factor `1`
- State: homepage, soundscape control collapsed; expanded player and active rotation were also required interaction states.
- Implementation screenshot: unavailable. The cloud browser initially opened the route, but after the clean production build its local-URL policy rejected the reload required to capture the implemented player.

**Findings**

- [P1] Rendered player cannot be visually compared yet
  Location: homepage miniature soundscape player.
  Evidence: the selected mock is available, but no browser-rendered implementation screenshot exists for the current clean build. The earlier browser capture showed the pre-reload page and therefore is not valid implementation evidence.
  Impact: size, right-edge inset, face/CTA/nav avoidance, transparency halo, typography, open-state density, and perceived rotation quality cannot be honestly accepted from source code alone.
  Fix: open the clean build in an allowed browser surface, capture collapsed/open/playing states at both target viewports, combine each implementation capture with the source mock, and rerun this comparison.

**Required Fidelity Surfaces**

- Fonts and typography: source code uses the inherited app typeface with 8–11px compact labels, but rendered weight, antialiasing, wrapping, and optical hierarchy are unverified.
- Spacing and layout rhythm: the implementation is constrained to a 42px disc inside a 44px touch target and a 180px maximum open shell, mounted above navigation; rendered collision and visual density are unverified.
- Colors and visual tokens: the control uses the app's warm ivory, charcoal, and muted champagne palette; browser compositing and backdrop contrast are unverified.
- Image quality and asset fidelity: a dedicated 512px transparent PNG disc is present and no CSS-drawn disc, logo, album cover, or copyrighted art is used; rendered transparency halos and scaling are unverified.
- Copy and content: the four labels are `暖光 / 相伴 / 星尘 / 重逢`; controls expose `上一景 / 播放或暂停 / 下一景` and a volume slider. Rendered legibility is unverified.

**Primary Interactions Tested**

- Source-level and unit coverage confirms bidirectional wraparound across all four procedural soundscapes.
- Type and hydration checks pass.
- Browser interaction testing for expand/collapse, play/pause, rotation, switching, and volume is blocked by the browser URL policy.

**Console Errors Checked**

- The earlier development preview produced a stale hot-refresh chunk syntax error before the clean production build.
- The clean production build compiled all 162 routes successfully.
- A post-build browser console check could not be completed because the browser rejected the local URL reload.

**Full-view Comparison Evidence**

- Blocked: no current browser-rendered implementation capture is available.

**Focused Region Comparison Evidence**

- Blocked: the compact player region cannot be cropped until a valid implementation screenshot is captured.

**Comparison History**

- Iteration 1: the previous large rectangular player was rejected by the Owner as oversized and visually crude.
- Fix: replaced it with a 42px real disc asset, edge-tucked 44px touch target, 180px maximum micro-bar, slow play-only rotation, four-scene switching, reduced-motion handling, and a hairline volume control.
- Post-fix visual evidence: blocked by the cloud browser local-URL policy after the clean build.

**Implementation Checklist**

- Capture clean-build mobile collapsed/open/playing states.
- Capture clean-build desktop collapsed/open/playing states.
- Check face, CTA, disclosure, and bottom-nav collisions.
- Check focus, 44px touch targets, reduced motion, and console errors.
- Fix any P0/P1/P2 mismatch and repeat comparison before promotion.

**Follow-up Polish**

- Judge whether the disc should rotate at 8 seconds or slightly slower only after motion is visible in the browser.

final result: blocked
