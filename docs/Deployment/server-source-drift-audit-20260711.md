# Server Source Drift Audit — 2026-07-11

## Scope

- Canonical comparison commit: `8ba5a6f26d7bb03adc592788097a0fd899378e22`
- Production source root: `/home/ubuntu/memory-ai`
- Read-only hash comparison; no production file was overwritten.
- Excluded: `.next`, `node_modules`, `.env*`, logs, PID files, caches, uploads, PostgreSQL data, and backups.

## Result

| Result | Count | Disposition |
|---|---:|---|
| Exact match | 634 | preserve |
| Line-ending-only difference | 100 | preserve |
| Server-only historical visual files | 19 | archive |
| Generated/runtime files | 4 | generated |
| Superseded or prohibited files | 4 | obsolete |
| Historical report requiring separate review | 1 | needs-review |
| Secret files | 0 compared | secret files were excluded by policy |

The 100 apparent source differences became byte-equivalent after CRLF/LF normalization. No semantic source change was found in those files.

## Archived historical visual files

These files were imported unchanged into `archive/server-visual-drift-20260711`. They are preserved as historical evidence only and are not merged into `canonical-mainline` by this closure task.

| File | Conclusion |
|---|---|
| `app/life-creation/page.tsx` | archive |
| `public/soul/B1.png.png` | archive |
| `public/soul/B2.png.png` | archive |
| `public/soul/B3.png.png` | archive |
| `public/soul/B4.png.png` | archive |
| `public/soul/B5.png.png` | archive |
| `src/engine/presence/camera/CameraController.tsx` | archive |
| `src/engine/presence/core/PresenceFog.tsx` | archive |
| `src/engine/presence/core/presence-stage.css` | archive |
| `src/engine/presence/core/PresenceStage.tsx` | archive |
| `src/engine/presence/director/DirectorConfig.ts` | archive |
| `src/engine/presence/light/HeartCore.tsx` | archive |
| `src/engine/presence/light/LightController.tsx` | archive |
| `src/engine/presence/light/SoulPresence.tsx` | archive |
| `src/engine/presence/overlay/OverlayLogin.tsx` | archive |
| `src/engine/presence/particle/PresenceParticles.tsx` | archive |
| `src/engine/presence/states/PresenceState.ts` | archive |
| `src/engine/presence/states/PresenceStore.ts` | archive |
| `src/engine/presence/timeline/PresenceTimeline.ts` | archive |

## Server-only files not archived

| File | Conclusion | Reason |
|---|---|---|
| `components/memory-soul/MemoryAwakening.tsx` | obsolete | Existing architecture ruling is `UNWIRED_PROTOTYPE / DO_NOT_RECOVER`. |
| `DEPLOYED_COMMIT` | generated | Deployment marker generated on the server. |
| `next-env.d.ts` | generated | Next.js generated type declaration. |
| `tsconfig.tsbuildinfo` | generated | TypeScript incremental build output. |
| `docs/Deployment/tencent-cloud-direct-deploy-package-report.md` | obsolete | References the prohibited legacy `80b79fe` deployment package. |
| `docs/Deployment/remote-main-diff-audit.md` | needs-review | Historical large audit tied to an older server baseline; not required to preserve the visual implementation. |

## Real content differences in tracked paths

| File | Conclusion | Reason |
|---|---|---|
| `docs/Blueprint/MemoryAI_Master_Blueprint.md` | obsolete | Server copy predates the Sprint15A canonical documentation. |
| `docs/Database/current-schema.md` | obsolete | Server copy is the old Supabase static audit; canonical commit contains the accepted PostgreSQL schema. |
| `package-lock.json` | generated | Server dependency installation mutated the lockfile; committed lockfile remains authoritative. |

## Line-ending-only files

Every file below is classified `preserve`; normalized content is identical to commit `8ba5a6f`.

```text
app/(dialogue)/dialogue/page.tsx
app/api/chat-sessions/[id]/messages/route.ts
app/api/chat-sessions/route.ts
app/api/health/ai/route.ts
app/api/health/database/route.ts
app/api/memories/[id]/chat-session/route.ts
app/api/memories/route.ts
app/api/memory-chat/route.ts
app/api/tts/route.ts
app/create-memory/page.tsx
app/memory-room/[id]/page.tsx
app/memory-world/page.tsx
app/page.tsx
app/splash/page.tsx
app/splash-3d/page.tsx
app/universe/page.tsx
database/migrations/001_memoryai_core.sql
database/migrations/002_memoryai_indexes.sql
database/migrations/003_memoryai_constraints.sql
docs/Deployment/sprint14-home-entry-online-acceptance.md
features/audit/audit-postgres-datasource.ts
features/audit/index.ts
features/chat/chat-postgres-datasource.ts
features/chat/index.ts
features/memory/index.ts
features/memory/memory-postgres-datasource.ts
features/memory/memory-supabase-datasource.ts
features/memory/types.ts
features/memory-engine/context-builder.ts
features/memory-engine/prompt/memory-prompt.ts
features/memory-engine/types.ts
package.json
scripts/migration/common.ts
scripts/migration/export-supabase-data.ts
scripts/migration/import-postgresql-data.ts
scripts/migration/verify-migration.ts
scripts/postgresql/apply-migrations.sh
scripts/postgresql/backup-postgresql.sh
scripts/postgresql/cos-upload.sh
scripts/postgresql/monitor-postgresql.sh
scripts/postgresql/restore-drill.sh
scripts/postgresql/test-memory-postgres.ts
scripts/verify-postgresql-architecture.cjs
scripts/verify-provider-architecture.cjs
services/ai/global-ai-registry.ts
services/tts/index.ts
services/tts/tencent-tts-provider.ts
services/tts/types.ts
src/components/memory-ui/COMPONENTS.md
src/components/memory-ui/index.ts
src/components/memory-ui/MemoryActionRow.tsx
src/components/memory-ui/MemoryAvatar.tsx
src/components/memory-ui/MemoryBottomSheet.tsx
src/components/memory-ui/MemoryButton.tsx
src/components/memory-ui/MemoryCard.tsx
src/components/memory-ui/MemoryHero.tsx
src/components/memory-ui/MemoryInput.tsx
src/components/memory-ui/MemorySection.tsx
src/components/memory-ui/MemorySurface.tsx
src/components/MobileAppShell.tsx
src/components/SplashScreen.tsx
src/design/components/Button/index.ts
src/design/components/Card/index.ts
src/design/components/index.ts
src/design/components/Section/index.ts
src/design/components/Surface/index.ts
src/design/DESIGN_TOKENS.md
src/design/index.ts
src/design/theme/theme.ts
src/design/tokens/colors.ts
src/design/tokens/index.ts
src/design/tokens/motion.ts
src/design/tokens/opacity.ts
src/design/tokens/radius.ts
src/design/tokens/shadow.ts
src/design/tokens/spacing.ts
src/design/tokens/typography.ts
src/design/tokens/zIndex.ts
src/motion/config/motion.config.ts
src/motion/hooks/index.ts
src/motion/hooks/useMotion.ts
src/motion/hooks/useMotionClock.ts
src/motion/hooks/useMotionScroll.ts
src/motion/hooks/useMotionSpring.ts
src/motion/hooks/useMotionVelocity.ts
src/motion/hooks/usePressMotion.ts
src/motion/hooks/useReducedMotion.ts
src/motion/hooks/useRevealMotion.ts
src/motion/index.ts
src/motion/MOTION_RUNTIME.md
src/motion/runtime/MotionClock.ts
src/motion/runtime/MotionContext.ts
src/motion/runtime/MotionProvider.tsx
src/motion/runtime/MotionReduced.ts
src/motion/runtime/MotionScroll.ts
src/motion/runtime/MotionSpring.ts
src/motion/runtime/MotionVelocity.ts
src/server/database/errors.ts
src/server/database/index.ts
src/server/database/postgres.ts
```

## Closure decision

- Production was not modified by this audit.
- Canonical source remains authoritative for the 100 semantic matches and 3 superseded/runtime differences.
- The Presence Engine archive requires an explicit future recovery decision before any merge; it currently depends on a server-only GSAP installation and is not part of the frozen product path.
- `MemoryAwakening` remains excluded under the existing `DO_NOT_RECOVER` ruling.
