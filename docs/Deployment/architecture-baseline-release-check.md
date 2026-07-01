# Architecture Baseline Release Check

## 1. Git 状态

当前分支状态：

``text
On branch main
Your branch is ahead of 'origin/main' by 6 commits.
  (use "git push" to publish your local commits)

Changes not staged for commit:
  (use "git add/rm <file>..." to update what will be committed)
  (use "git restore <file>..." to discard changes in working directory)
	modified:   app/(dialogue)/dialogue/page.tsx
	modified:   app/api/health/route.ts
	modified:   app/api/memories/route.ts
	modified:   app/api/memory-chat/route.ts
	modified:   app/api/tts/route.ts
	modified:   app/create-memory/page.tsx
	modified:   app/login/page.tsx
	modified:   app/memory-chat/[id]/page.tsx
	modified:   components/Footer.tsx
	modified:   components/ui/BottomTab.tsx
	modified:   components/world/HomeV3.tsx
	deleted:    components/world/SoulSilhouette.tsx
	modified:   package-lock.json
	modified:   package.json
	modified:   src/components/MobileAppShell.tsx

Untracked files:
  (use "git add <file>..." to include in what will be committed)
	app/api/chat-sessions/
	app/api/health/ai/
	app/api/health/database/
	app/api/memories/[id]/
	app/api/memory-engine/
	components/memory-soul/
	docs/
	features/
	memory-ai-934c4d5.zip
	public/soul/
	scripts/backup-production.sh
	scripts/check-production.sh
	scripts/deploy-production.sh
	scripts/logs-production.sh
	scripts/rollback-production.sh
	scripts/safe-deploy.sh
	services/
	supabase/sql/
	work/

no changes added to commit (use "git add" and/or "git commit -a")
``

简要变更清单：

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

结论：当前工作区不干净，存在未暂存修改、删除文件、未跟踪文件，并且本地 main 分支领先 origin/main 6 个 commit。

## 2. Build 结果

命令：

``bash
npm run build
``

结果：成功。

观察：Next.js build 完成，生成静态页面与动态路由清单，命令退出码为 0。

## 3. SQL 文件检查

| 文件 | 状态 |
|---|---|
| $f | 存在 |
| $f | 存在 |
| $f | 存在 |
| $f | 存在 |
| $f | 存在 |
| $f | 存在 |
| $f | 存在 |

## 4. 健康检查 API 检查

| 文件 | 状态 |
|---|---|
| $f | 存在 |
| $f | 存在 |
| $f | 存在 |

## 5. 当前是否建议部署

不建议立即部署。

原因：虽然 build 成功，SQL 文件与健康检查 API 文件均存在，但当前 git status 不清晰，存在大量未提交/未跟踪变更，并且包含 package.json、package-lock.json、pp/、components/ 等生产相关变更。根据 Release Gate，部署前必须先完成代码审查、确认变更范围、提交必要变更，并确保部署目标 commit 明确可追踪。

建议部署条件：

- 明确本次部署包含的 commit。
- 清理或提交当前工作区变更。
- 确认 package.json / package-lock.json 的变更是否符合预期。
- 确认删除 components/world/SoulSilhouette.tsx 是否符合预期。
- 重新执行 git status，确保状态可解释。
- 重新执行 
pm run build。

## 6. 部署前风险清单

- 工作区存在未提交修改，线上部署 commit 不可清晰追踪。
- 本地 main 领先远端 origin/main 6 个 commit，远端尚未同步这些提交。
- package.json 与 package-lock.json 已修改，需要确认依赖变更是否安全。
- 存在 pp/ 与 API 相关修改，需要确认是否已完成代码审查。
- 存在未跟踪的 supabase/sql/ 文件；本任务未执行 SQL，部署前需确认迁移执行策略。
- 存在未跟踪的脚本和文档，需要确认是否纳入发布版本。
- 存在未跟踪压缩包 memory-ai-934c4d5.zip，部署前应确认是否需要保留或排除。
- 健康检查 API 文件存在，但本任务未启动本地服务进行 HTTP 实测。
- 本任务未连接服务器、未执行生产检查脚本、未验证 Nginx/PM2/域名状态。
