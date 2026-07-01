# Git Change Audit Before Baseline Deploy

## 1. 当前分支状态

命令：

``bash
git status --short
``

结果：

``text
 M app/(dialogue)/dialogue/page.tsx
 M app/api/health/route.ts
 M app/api/memories/route.ts
 M app/api/memory-chat/route.ts
 M app/api/tts/route.ts
 M app/create-memory/page.tsx
 M app/login/page.tsx
 M app/memory-chat/[id]/page.tsx
 M components/Footer.tsx
 M components/ui/BottomTab.tsx
 M components/world/HomeV3.tsx
 D components/world/SoulSilhouette.tsx
 M package-lock.json
 M package.json
 M src/components/MobileAppShell.tsx
?? app/api/chat-sessions/
?? app/api/health/ai/
?? app/api/health/database/
?? app/api/memories/[id]/
?? app/api/memory-engine/
?? components/memory-soul/
?? docs/
?? features/
?? memory-ai-934c4d5.zip
?? public/soul/
?? scripts/backup-production.sh
?? scripts/check-production.sh
?? scripts/deploy-production.sh
?? scripts/logs-production.sh
?? scripts/rollback-production.sh
?? scripts/safe-deploy.sh
?? services/
?? supabase/sql/
?? work/
``

状态摘要：

- 当前工作区存在 tracked 修改、tracked 删除、untracked 文件。
- 本次审计只读取 Git 状态，不执行 git add、git commit、git reset、git clean。
- 当前状态不适合直接部署，需要先完成变更分类确认。

## 2. 本地领先 commits

命令：

``bash
git log --oneline origin/main..HEAD
``

结果：

``text
37682bd feat: MemorySoulBody - 记忆灵魂体加载动画 (4状态 CSS 动画)
934c4d5 ui: add splash and four tab dream interface
95b8299 fix: resolve lightningcss native binary missing on Node 24
6908e78 feat: V2 product experience - emotional companion redesign
915d8f4 feat: production deployment setup with PM2, Nginx, health check
f16bb4a feat: complete provider framework, voice chat, env config, and deployment docs
``

## 3. git diff --stat

命令：

``bash
git diff --stat
``

结果：

``text
app/(dialogue)/dialogue/page.tsx    | 509 +++++++++++++++++-------------------
 app/api/health/route.ts             |  68 +----
 app/api/memories/route.ts           |  94 +++++--
 app/api/memory-chat/route.ts        |   8 +-
 app/api/tts/route.ts                | 123 ++++++---
 app/create-memory/page.tsx          |  38 +--
 app/login/page.tsx                  |  56 +---
 app/memory-chat/[id]/page.tsx       |  62 +++--
 components/Footer.tsx               |   3 +-
 components/ui/BottomTab.tsx         |  95 ++++---
 components/world/HomeV3.tsx         | 226 ++--------------
 components/world/SoulSilhouette.tsx |  33 ---
 package-lock.json                   |  48 ++++
 package.json                        |   1 +
 src/components/MobileAppShell.tsx   |  29 +-
 15 files changed, 608 insertions(+), 785 deletions(-)
``

## 4. 所有变更文件清单

| Status | File |
|---|---|
| $(@{Category=B. 需要重点确认; Status=M; Path=app/(dialogue)/dialogue/page.tsx}.Status) | `app/(dialogue)/dialogue/page.tsx` |
| $(@{Category=A. 架构基线应提交; Status=M; Path=app/api/health/route.ts}.Status) | `app/api/health/route.ts` |
| $(@{Category=A. 架构基线应提交; Status=M; Path=app/api/memories/route.ts}.Status) | `app/api/memories/route.ts` |
| $(@{Category=B. 需要重点确认; Status=M; Path=app/api/memory-chat/route.ts}.Status) | `app/api/memory-chat/route.ts` |
| $(@{Category=B. 需要重点确认; Status=M; Path=app/api/tts/route.ts}.Status) | `app/api/tts/route.ts` |
| $(@{Category=B. 需要重点确认; Status=M; Path=app/create-memory/page.tsx}.Status) | `app/create-memory/page.tsx` |
| $(@{Category=B. 需要重点确认; Status=M; Path=app/login/page.tsx}.Status) | `app/login/page.tsx` |
| $(@{Category=B. 需要重点确认; Status=M; Path=app/memory-chat/[id]/page.tsx}.Status) | `app/memory-chat/[id]/page.tsx` |
| $(@{Category=B. 需要重点确认; Status=M; Path=components/Footer.tsx}.Status) | `components/Footer.tsx` |
| $(@{Category=B. 需要重点确认; Status=M; Path=components/ui/BottomTab.tsx}.Status) | `components/ui/BottomTab.tsx` |
| $(@{Category=B. 需要重点确认; Status=M; Path=components/world/HomeV3.tsx}.Status) | `components/world/HomeV3.tsx` |
| $(@{Category=B. 需要重点确认; Status=D; Path=components/world/SoulSilhouette.tsx}.Status) | `components/world/SoulSilhouette.tsx` |
| $(@{Category=B. 需要重点确认; Status=M; Path=package-lock.json}.Status) | `package-lock.json` |
| $(@{Category=B. 需要重点确认; Status=M; Path=package.json}.Status) | `package.json` |
| $(@{Category=B. 需要重点确认; Status=M; Path=src/components/MobileAppShell.tsx}.Status) | `src/components/MobileAppShell.tsx` |
| $(@{Category=A. 架构基线应提交; Status=??; Path=app/api/chat-sessions/}.Status) | `app/api/chat-sessions/` |
| $(@{Category=A. 架构基线应提交; Status=??; Path=app/api/health/ai/}.Status) | `app/api/health/ai/` |
| $(@{Category=A. 架构基线应提交; Status=??; Path=app/api/health/database/}.Status) | `app/api/health/database/` |
| $(@{Category=A. 架构基线应提交; Status=??; Path=app/api/memories/[id]/}.Status) | `app/api/memories/[id]/` |
| $(@{Category=A. 架构基线应提交; Status=??; Path=app/api/memory-engine/}.Status) | `app/api/memory-engine/` |
| $(@{Category=B. 需要重点确认; Status=??; Path=components/memory-soul/}.Status) | `components/memory-soul/` |
| $(@{Category=A. 架构基线应提交; Status=??; Path=docs/}.Status) | `docs/` |
| $(@{Category=A. 架构基线应提交; Status=??; Path=features/}.Status) | `features/` |
| $(@{Category=C. 可能不应提交; Status=??; Path=memory-ai-934c4d5.zip}.Status) | `memory-ai-934c4d5.zip` |
| $(@{Category=B. 需要重点确认; Status=??; Path=public/soul/}.Status) | `public/soul/` |
| $(@{Category=A. 架构基线应提交; Status=??; Path=scripts/backup-production.sh}.Status) | `scripts/backup-production.sh` |
| $(@{Category=A. 架构基线应提交; Status=??; Path=scripts/check-production.sh}.Status) | `scripts/check-production.sh` |
| $(@{Category=A. 架构基线应提交; Status=??; Path=scripts/deploy-production.sh}.Status) | `scripts/deploy-production.sh` |
| $(@{Category=A. 架构基线应提交; Status=??; Path=scripts/logs-production.sh}.Status) | `scripts/logs-production.sh` |
| $(@{Category=A. 架构基线应提交; Status=??; Path=scripts/rollback-production.sh}.Status) | `scripts/rollback-production.sh` |
| $(@{Category=A. 架构基线应提交; Status=??; Path=scripts/safe-deploy.sh}.Status) | `scripts/safe-deploy.sh` |
| $(@{Category=A. 架构基线应提交; Status=??; Path=services/}.Status) | `services/` |
| $(@{Category=A. 架构基线应提交; Status=??; Path=supabase/sql/}.Status) | `supabase/sql/` |
| $(@{Category=C. 可能不应提交; Status=??; Path=work/}.Status) | `work/` |

## 5. 分类结果

### A. 架构基线应提交

范围：eatures/、services/、docs/、scripts/、supabase/sql/、pp/api/health/、pp/api/chat-sessions/、pp/api/memories/、pp/api/memory-engine/。

| Status | File |
|---|---|
| $(@{Category=A. 架构基线应提交; Status=??; Path=app/api/chat-sessions/}.Status) | `app/api/chat-sessions/` |
| $(@{Category=A. 架构基线应提交; Status=??; Path=app/api/health/ai/}.Status) | `app/api/health/ai/` |
| $(@{Category=A. 架构基线应提交; Status=??; Path=app/api/health/database/}.Status) | `app/api/health/database/` |
| $(@{Category=A. 架构基线应提交; Status=M; Path=app/api/health/route.ts}.Status) | `app/api/health/route.ts` |
| $(@{Category=A. 架构基线应提交; Status=??; Path=app/api/memories/[id]/}.Status) | `app/api/memories/[id]/` |
| $(@{Category=A. 架构基线应提交; Status=M; Path=app/api/memories/route.ts}.Status) | `app/api/memories/route.ts` |
| $(@{Category=A. 架构基线应提交; Status=??; Path=app/api/memory-engine/}.Status) | `app/api/memory-engine/` |
| $(@{Category=A. 架构基线应提交; Status=??; Path=docs/}.Status) | `docs/` |
| $(@{Category=A. 架构基线应提交; Status=??; Path=features/}.Status) | `features/` |
| $(@{Category=A. 架构基线应提交; Status=??; Path=scripts/backup-production.sh}.Status) | `scripts/backup-production.sh` |
| $(@{Category=A. 架构基线应提交; Status=??; Path=scripts/check-production.sh}.Status) | `scripts/check-production.sh` |
| $(@{Category=A. 架构基线应提交; Status=??; Path=scripts/deploy-production.sh}.Status) | `scripts/deploy-production.sh` |
| $(@{Category=A. 架构基线应提交; Status=??; Path=scripts/logs-production.sh}.Status) | `scripts/logs-production.sh` |
| $(@{Category=A. 架构基线应提交; Status=??; Path=scripts/rollback-production.sh}.Status) | `scripts/rollback-production.sh` |
| $(@{Category=A. 架构基线应提交; Status=??; Path=scripts/safe-deploy.sh}.Status) | `scripts/safe-deploy.sh` |
| $(@{Category=A. 架构基线应提交; Status=??; Path=services/}.Status) | `services/` |
| $(@{Category=A. 架构基线应提交; Status=??; Path=supabase/sql/}.Status) | `supabase/sql/` |

### B. 需要重点确认

范围：pp/、components/、package.json、package-lock.json、
ext.config、	sconfig、public/ 以及其他产品/业务相关文件。

| Status | File |
|---|---|
| $(@{Category=B. 需要重点确认; Status=M; Path=app/(dialogue)/dialogue/page.tsx}.Status) | `app/(dialogue)/dialogue/page.tsx` |
| $(@{Category=B. 需要重点确认; Status=M; Path=app/api/memory-chat/route.ts}.Status) | `app/api/memory-chat/route.ts` |
| $(@{Category=B. 需要重点确认; Status=M; Path=app/api/tts/route.ts}.Status) | `app/api/tts/route.ts` |
| $(@{Category=B. 需要重点确认; Status=M; Path=app/create-memory/page.tsx}.Status) | `app/create-memory/page.tsx` |
| $(@{Category=B. 需要重点确认; Status=M; Path=app/login/page.tsx}.Status) | `app/login/page.tsx` |
| $(@{Category=B. 需要重点确认; Status=M; Path=app/memory-chat/[id]/page.tsx}.Status) | `app/memory-chat/[id]/page.tsx` |
| $(@{Category=B. 需要重点确认; Status=M; Path=components/Footer.tsx}.Status) | `components/Footer.tsx` |
| $(@{Category=B. 需要重点确认; Status=??; Path=components/memory-soul/}.Status) | `components/memory-soul/` |
| $(@{Category=B. 需要重点确认; Status=M; Path=components/ui/BottomTab.tsx}.Status) | `components/ui/BottomTab.tsx` |
| $(@{Category=B. 需要重点确认; Status=M; Path=components/world/HomeV3.tsx}.Status) | `components/world/HomeV3.tsx` |
| $(@{Category=B. 需要重点确认; Status=D; Path=components/world/SoulSilhouette.tsx}.Status) | `components/world/SoulSilhouette.tsx` |
| $(@{Category=B. 需要重点确认; Status=M; Path=package.json}.Status) | `package.json` |
| $(@{Category=B. 需要重点确认; Status=M; Path=package-lock.json}.Status) | `package-lock.json` |
| $(@{Category=B. 需要重点确认; Status=??; Path=public/soul/}.Status) | `public/soul/` |
| $(@{Category=B. 需要重点确认; Status=M; Path=src/components/MobileAppShell.tsx}.Status) | `src/components/MobileAppShell.tsx` |

### C. 可能不应提交

范围：临时文件、日志、构建产物、本地测试文件、重复文件、被删除但原因不明的文件。

| Status | File |
|---|---|
| $(@{Category=C. 可能不应提交; Status=??; Path=memory-ai-934c4d5.zip}.Status) | `memory-ai-934c4d5.zip` |
| $(@{Category=C. 可能不应提交; Status=??; Path=work/}.Status) | `work/` |

## 6. 风险文件

| Status | File |
|---|---|
| $(@{Category=B. 需要重点确认; Status=M; Path=app/(dialogue)/dialogue/page.tsx}.Status) | `app/(dialogue)/dialogue/page.tsx` |
| $(@{Category=B. 需要重点确认; Status=M; Path=app/api/memory-chat/route.ts}.Status) | `app/api/memory-chat/route.ts` |
| $(@{Category=B. 需要重点确认; Status=M; Path=app/api/tts/route.ts}.Status) | `app/api/tts/route.ts` |
| $(@{Category=B. 需要重点确认; Status=M; Path=app/create-memory/page.tsx}.Status) | `app/create-memory/page.tsx` |
| $(@{Category=B. 需要重点确认; Status=M; Path=app/login/page.tsx}.Status) | `app/login/page.tsx` |
| $(@{Category=B. 需要重点确认; Status=M; Path=app/memory-chat/[id]/page.tsx}.Status) | `app/memory-chat/[id]/page.tsx` |
| $(@{Category=B. 需要重点确认; Status=M; Path=components/Footer.tsx}.Status) | `components/Footer.tsx` |
| $(@{Category=B. 需要重点确认; Status=??; Path=components/memory-soul/}.Status) | `components/memory-soul/` |
| $(@{Category=B. 需要重点确认; Status=M; Path=components/ui/BottomTab.tsx}.Status) | `components/ui/BottomTab.tsx` |
| $(@{Category=B. 需要重点确认; Status=M; Path=components/world/HomeV3.tsx}.Status) | `components/world/HomeV3.tsx` |
| $(@{Category=B. 需要重点确认; Status=D; Path=components/world/SoulSilhouette.tsx}.Status) | `components/world/SoulSilhouette.tsx` |
| $(@{Category=B. 需要重点确认; Status=M; Path=package.json}.Status) | `package.json` |
| $(@{Category=B. 需要重点确认; Status=M; Path=package-lock.json}.Status) | `package-lock.json` |
| $(@{Category=B. 需要重点确认; Status=??; Path=public/soul/}.Status) | `public/soul/` |
| $(@{Category=B. 需要重点确认; Status=M; Path=src/components/MobileAppShell.tsx}.Status) | `src/components/MobileAppShell.tsx` |
| $(@{Category=C. 可能不应提交; Status=??; Path=memory-ai-934c4d5.zip}.Status) | `memory-ai-934c4d5.zip` |
| $(@{Category=C. 可能不应提交; Status=??; Path=work/}.Status) | `work/` |

重点风险说明：

- package.json 与 package-lock.json 已修改，可能影响生产依赖，应重点确认。
- components/world/SoulSilhouette.tsx 为删除状态，删除原因需要确认。
- pp/ 下存在多处非健康检查 API、页面与业务相关修改，需要确认是否属于本次发布范围。
- components/ 与 src/components/ 存在 UI/组件变更，需要确认是否应进入架构基线提交。
- public/soul/ 新增静态资源，需要确认是否属于视觉/产品变更。
- memory-ai-934c4d5.zip 是压缩包，通常不应提交。
- work/ 下存在本地测试/修复脚本，通常不应提交。
- docs/Database_audit_raw.json 看起来像审计中间产物，建议确认是否需要保留。

## 7. 建议下一步

不建议直接进入提交阶段。

可以进入“提交前整理阶段”，但不建议立刻提交架构基线。当前变更中既包含架构基线文件，也混有页面、组件、依赖、public 资源、压缩包、work 临时脚本、删除文件等风险变更。建议先由负责人确认 B/C 类文件：

1. A 类架构基线文件可以作为候选提交范围。
2. B 类文件需要逐项确认是否属于本次架构基线部署范围。
3. C 类文件建议默认排除，除非有明确理由。
4. 特别确认 `package.json`、`package-lock.json`、`components/world/SoulSilhouette.tsx` 删除、`memory-ai-934c4d5.zip`、`work/` 临时脚本。
5. 完成确认后再执行提交，不要在未分类清楚前部署。
