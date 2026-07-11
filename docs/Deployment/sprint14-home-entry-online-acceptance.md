# Sprint14 Home Entry Online Acceptance

Date: 2026-07-11
Repository: C:\Users\Administrator\MemoryAi-mainline
Branch: canonical-mainline
Production URL: https://yijianmemory.cn
Production PM2 app: memoryai
Production cwd: /home/ubuntu/memory-ai

## Changed Files

- app/page.tsx
- app/splash/page.tsx
- app/splash-3d/page.tsx
- app/universe/page.tsx
- app/memory-room/[id]/page.tsx
- app/memory-world/page.tsx
- app/(dialogue)/dialogue/page.tsx
- app/(memory)/memory/page.tsx
- src/components/SplashScreen.tsx
- src/components/MobileAppShell.tsx
- src/components/BottomNav.tsx
- src/components/memory-ui/MemoryButton.tsx
- docs/Blueprint/MemoryAI_Master_Blueprint.md
- docs/Deployment/sprint14-home-entry-online-acceptance.md
- docs/Deployment/evidence/sprint14-prod-360.png
- docs/Deployment/evidence/sprint14-prod-390-home.png
- docs/Deployment/evidence/sprint14-prod-390-memory-world.png
- docs/Deployment/evidence/sprint14-prod-390-reduced-motion.png
- docs/Deployment/evidence/sprint14-prod-390-flow.webm
- docs/Deployment/evidence/sprint14-prod-430.png

## Legacy Entry Mapping

| Old entry | Sprint14 behavior | Online status |
| --- | --- | --- |
| / | Canonical product homepage | PASS |
| /splash | Redirects to / | PASS |
| /splash-3d | Redirects to / | PASS |
| /universe | Redirects to /memory-world | PASS |
| /memory-room/[id] | Redirects to /memory-world | PASS |

## Homepage States

| State | Behavior | Status |
| --- | --- | --- |
| loading | Skeleton card while memory data loads | PASS |
| empty | Real empty state with create guide | PASS |
| ready | Shows active real memory, completeness, and chat route when data exists | PASS by code path; no production test account used |
| error | Retry card without blank page | PASS by code path |
| unauthenticated | Homepage remains visible; create CTA enters existing create/login flow | PASS |

## Splash Timeline

| Requirement | Implementation | Status |
| --- | --- | --- |
| 0.0s pure black | Initial splash shell starts on #000000 and no canvas | PASS |
| 0.6s atmosphere | Low-density warm glow phase | PASS |
| 1.4s presence | Soft human/presence silhouette phase | PASS |
| 2.2s brand | Brand copy fades in | PASS |
| 3.0s enter homepage | onComplete scheduled at 3000ms | PASS |
| <= 3.2s hard stop | hardStop scheduled at 3200ms | PASS |
| Seen session skip | sessionStorage key skips full splash | PASS |
| Reduced motion | short fade, no breathing/particles | PASS |

## Local Verification

| Check | Result |
| --- | --- |
| git diff --check | PASS |
| npm run build | PASS |
| npx tsc --noEmit | PASS |
| npm run lint | FAIL: existing repository lint debt outside Sprint14 scope remains in legacy files; Next build skips lint and typecheck passes |
| Local / at 360x800 | PASS: no horizontal overflow; title/nav/primary CTA visible |
| Local / at 390x844 | PASS: no horizontal overflow; title/nav/primary CTA visible |
| Local / at 430x932 | PASS: no horizontal overflow; title/nav/primary CTA visible |
| Local bottom nav /memory-world | PASS |

## Deployment Verification

| Check | Result |
| --- | --- |
| Server backup | /home/ubuntu/memoryai-backups/sprint14-pre-20260711-140841.tar.gz |
| Canonical tracked files deployed | PASS; env/node_modules/backups preserved |
| Production build | PASS |
| PM2 restart | PASS; memoryai online |
| Nginx config | PASS |
| HTTPS / | PASS: 200 https://yijianmemory.cn/ |
| /splash | PASS: 200 final https://yijianmemory.cn/ |
| /splash-3d | PASS: 200 final https://yijianmemory.cn/ |
| /universe | PASS: 200 final https://yijianmemory.cn/memory-world |
| /memory-world | PASS: 200 https://yijianmemory.cn/memory-world |
| /create-memory | PASS: 200, browser flow redirects unauthenticated user to /login |
| /login | PASS: 200 |
| /api/health | PASS: 200 |
| /api/health/ai | PASS: 200 |
| /api/health/database | FAIL: 500 {"status":"error","message":"TypeError: fetch failed"}; existing production database health issue outside Sprint14 UI scope |

## Performance

390x844 production Chromium run after deploy:

| Metric | Result |
| --- | --- |
| responseEnd | 134ms |
| DOMContentLoaded | 405ms |
| loadEventEnd | 418ms |
| LCP | 460ms |
| CLS | 0 |
| INP proxy | max observed event duration 0ms during scripted tap |
| Horizontal overflow | PASS |

## Dynamic Evidence

- Recording: docs/Deployment/evidence/sprint14-prod-390-flow.webm
- 360px screenshot: docs/Deployment/evidence/sprint14-prod-360.png
- 390px home screenshot: docs/Deployment/evidence/sprint14-prod-390-home.png
- 390px memory-world screenshot: docs/Deployment/evidence/sprint14-prod-390-memory-world.png
- 390px reduced-motion screenshot: docs/Deployment/evidence/sprint14-prod-390-reduced-motion.png
- 430px screenshot: docs/Deployment/evidence/sprint14-prod-430.png

## Backup And Rollback

Backup: /home/ubuntu/memoryai-backups/sprint14-pre-20260711-140841.tar.gz
Rollback command outline:

1. ssh ubuntu@yijianmemory.cn
2. cd /home/ubuntu
3. stop or keep PM2 running until extraction is ready
4. tar -xzf /home/ubuntu/memoryai-backups/sprint14-pre-20260711-140841.tar.gz -C /home/ubuntu
5. cd /home/ubuntu/memory-ai
6. npm run build
7. pm2 restart memoryai
8. sudo nginx -t
9. curl -I https://yijianmemory.cn/

## Known Non-blocking Issues

- Repository-wide lint command fails on pre-existing legacy lint errors outside the Sprint14 touched surface.
- /api/health/database returns 500 TypeError: fetch failed in production; not caused by Sprint14 UI changes, but it remains a deployment health FAIL.
- Production server had drift from canonical tracked files and is not a Git checkout; Sprint14 aligned tracked files by tar/scp while preserving env and runtime directories. Restoring a Git-backed production checkout is recommended.
- PM2 logs retain pre-existing Next warnings about multiple lockfiles and standalone start mode; PM2 remains online and public routes are serving.
