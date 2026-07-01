# Architecture Baseline Commit Plan

## 1. 本次建议提交文件清单

以下文件建议纳入本次 Architecture Baseline 候选提交范围。范围严格限制为：docs/Architecture/、docs/Database/、docs/Deployment/、docs/Blueprint/、scripts/、supabase/sql/、eatures/、services/、pp/api/health/、pp/api/chat-sessions/、pp/api/memories/、pp/api/memory-engine/。

| Status | File |
|---|---|
| $(@{Status=??; Path=app/api/chat-sessions/}.Status) | `app/api/chat-sessions/` |
| $(@{Status=??; Path=app/api/health/ai/}.Status) | `app/api/health/ai/` |
| $(@{Status=??; Path=app/api/health/database/}.Status) | `app/api/health/database/` |
| $(@{Status=M; Path=app/api/health/route.ts}.Status) | `app/api/health/route.ts` |
| $(@{Status=??; Path=app/api/memories/[id]/}.Status) | `app/api/memories/[id]/` |
| $(@{Status=M; Path=app/api/memories/route.ts}.Status) | `app/api/memories/route.ts` |
| $(@{Status=??; Path=app/api/memory-engine/}.Status) | `app/api/memory-engine/` |
| $(@{Status=??; Path=docs/Deployment/architecture-baseline-commit-plan.md}.Status) | `docs/Deployment/architecture-baseline-commit-plan.md` |
| $(@{Status=??; Path=features/}.Status) | `features/` |
| $(@{Status=??; Path=scripts/backup-production.sh}.Status) | `scripts/backup-production.sh` |
| $(@{Status=??; Path=scripts/check-production.sh}.Status) | `scripts/check-production.sh` |
| $(@{Status=??; Path=scripts/deploy-production.sh}.Status) | `scripts/deploy-production.sh` |
| $(@{Status=??; Path=scripts/logs-production.sh}.Status) | `scripts/logs-production.sh` |
| $(@{Status=??; Path=scripts/rollback-production.sh}.Status) | `scripts/rollback-production.sh` |
| $(@{Status=??; Path=scripts/safe-deploy.sh}.Status) | `scripts/safe-deploy.sh` |
| $(@{Status=??; Path=services/}.Status) | `services/` |
| $(@{Status=??; Path=supabase/sql/}.Status) | `supabase/sql/` |

## 2. 明确排除文件清单

以下文件不建议纳入本次 Architecture Baseline 提交。排除范围包括页面文件、组件、UI/视觉资源、public/、work/、zip 文件、临时 JSON、package.json、package-lock.json、删除文件和其他非基线业务变更。

| Status | File |
|---|---|
| $(@{Status=M; Path=app/(dialogue)/dialogue/page.tsx}.Status) | `app/(dialogue)/dialogue/page.tsx` |
| $(@{Status=M; Path=app/api/memory-chat/route.ts}.Status) | `app/api/memory-chat/route.ts` |
| $(@{Status=M; Path=app/api/tts/route.ts}.Status) | `app/api/tts/route.ts` |
| $(@{Status=M; Path=app/create-memory/page.tsx}.Status) | `app/create-memory/page.tsx` |
| $(@{Status=M; Path=app/login/page.tsx}.Status) | `app/login/page.tsx` |
| $(@{Status=M; Path=app/memory-chat/[id]/page.tsx}.Status) | `app/memory-chat/[id]/page.tsx` |
| $(@{Status=M; Path=components/Footer.tsx}.Status) | `components/Footer.tsx` |
| $(@{Status=??; Path=components/memory-soul/}.Status) | `components/memory-soul/` |
| $(@{Status=M; Path=components/ui/BottomTab.tsx}.Status) | `components/ui/BottomTab.tsx` |
| $(@{Status=M; Path=components/world/HomeV3.tsx}.Status) | `components/world/HomeV3.tsx` |
| $(@{Status=D; Path=components/world/SoulSilhouette.tsx}.Status) | `components/world/SoulSilhouette.tsx` |
| $(@{Status=??; Path=docs/}.Status) | `docs/` |
| $(@{Status=??; Path=memory-ai-934c4d5.zip}.Status) | `memory-ai-934c4d5.zip` |
| $(@{Status=M; Path=package.json}.Status) | `package.json` |
| $(@{Status=M; Path=package-lock.json}.Status) | `package-lock.json` |
| $(@{Status=??; Path=public/soul/}.Status) | `public/soul/` |
| $(@{Status=M; Path=src/components/MobileAppShell.tsx}.Status) | `src/components/MobileAppShell.tsx` |
| $(@{Status=??; Path=work/}.Status) | `work/` |

## 3. 需要人工确认文件清单

以下文件需要负责人确认处理方式。默认不进入本次 Architecture Baseline 提交，除非明确确认属于本次发布范围。

| Status | File |
|---|---|
| $(@{Status=M; Path=app/(dialogue)/dialogue/page.tsx}.Status) | `app/(dialogue)/dialogue/page.tsx` |
| $(@{Status=M; Path=app/api/memory-chat/route.ts}.Status) | `app/api/memory-chat/route.ts` |
| $(@{Status=M; Path=app/api/tts/route.ts}.Status) | `app/api/tts/route.ts` |
| $(@{Status=M; Path=app/create-memory/page.tsx}.Status) | `app/create-memory/page.tsx` |
| $(@{Status=M; Path=app/login/page.tsx}.Status) | `app/login/page.tsx` |
| $(@{Status=M; Path=app/memory-chat/[id]/page.tsx}.Status) | `app/memory-chat/[id]/page.tsx` |
| $(@{Status=M; Path=components/Footer.tsx}.Status) | `components/Footer.tsx` |
| $(@{Status=??; Path=components/memory-soul/}.Status) | `components/memory-soul/` |
| $(@{Status=M; Path=components/ui/BottomTab.tsx}.Status) | `components/ui/BottomTab.tsx` |
| $(@{Status=M; Path=components/world/HomeV3.tsx}.Status) | `components/world/HomeV3.tsx` |
| $(@{Status=D; Path=components/world/SoulSilhouette.tsx}.Status) | `components/world/SoulSilhouette.tsx` |
| $(@{Status=??; Path=memory-ai-934c4d5.zip}.Status) | `memory-ai-934c4d5.zip` |
| $(@{Status=M; Path=package.json}.Status) | `package.json` |
| $(@{Status=M; Path=package-lock.json}.Status) | `package-lock.json` |
| $(@{Status=??; Path=public/soul/}.Status) | `public/soul/` |
| $(@{Status=M; Path=src/components/MobileAppShell.tsx}.Status) | `src/components/MobileAppShell.tsx` |
| $(@{Status=??; Path=work/}.Status) | `work/` |

## 4. 是否建议提交

建议进入提交前整理阶段，但不要直接执行全量提交。

建议做法：

1. 仅选择第 1 节候选文件作为 Architecture Baseline 提交范围。
2. 第 2 节文件默认排除。
3. 第 3 节文件逐项人工确认；确认前不得进入基线提交。
4. 提交前再次运行 git status --short，确认 staged 范围只包含候选清单。
5. 提交后再次运行 
pm run build。

## 5. 推荐 Commit Message

`	ext
architecture: freeze MemoryAI V1 platform baseline
`

## 6. 本任务未执行的操作

本任务只生成提交计划文档，未执行：

- git add
- git commit
- git reset
- git clean
- 删除文件
- 恢复文件
- 部署
- 连接服务器
- 修改业务代码
