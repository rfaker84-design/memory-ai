# Architecture Baseline Git Commands

## 1. 状态说明

本文件仅生成 Architecture Baseline 候选提交命令清单。

以下命令尚未执行。

本任务未执行：

- `git add`
- `git commit`
- `git tag`
- `git reset`
- `git clean`
- 删除文件
- 部署
- 连接服务器

## 2. 精准 git add 命令

以下 `git add` 范围仅包含 `architecture-baseline-commit-plan.md` 中的候选提交类别：

- `docs/Architecture/`
- `docs/Database/`
- `docs/Deployment/`
- `docs/Blueprint/`
- `scripts/`
- `supabase/sql/`
- `features/`
- `services/`
- `app/api/health/`
- `app/api/chat-sessions/`
- `app/api/memories/`
- `app/api/memory-engine/`

```bash
git add -- \
  docs/Architecture/ \
  docs/Database/ \
  docs/Deployment/ \
  docs/Blueprint/ \
  scripts/ \
  supabase/sql/ \
  features/ \
  services/ \
  app/api/health/ \
  app/api/chat-sessions/ \
  app/api/memories/ \
  app/api/memory-engine/
```

## 3. 明确不得加入的文件

上述命令不得替换为 `git add .`。

不得加入：

- `app/` 下页面文件
- `components/`
- `src/components/`
- `public/`
- `work/`
- zip 文件
- 临时 JSON
- `package.json`
- `package-lock.json`
- 删除文件
- 任何 UI / 视觉资源

特别不要执行：

```bash
git add .
git add -A
git add app/
git add components/
git add public/
git add work/
git add package.json package-lock.json
git add memory-ai-934c4d5.zip
```

## 4. git status 检查命令

在执行精准 `git add` 后，应检查 staged 范围：

```bash
git status --short
```

建议额外检查 staged diff：

```bash
git diff --cached --stat
git diff --cached --name-status
```

确认 staged 文件只包含第 2 节允许范围后，才允许进入 commit。

## 5. git commit 命令

推荐 commit message：

```bash
git commit -m "architecture: freeze MemoryAI V1 platform baseline"
```

## 6. git tag 建议命令

推荐 tag：

```bash
git tag architecture-baseline-v1
```

如需推送 tag，应由负责人确认后再执行：

```bash
git push origin architecture-baseline-v1
```

## 7. 提交后验证命令

提交后建议再次执行：

```bash
git status --short
npm run build
```

## 8. 最终提醒

本文件中的命令是候选命令清单，不代表已经执行。

执行前必须再次确认：

1. 不使用 `git add .`。
2. 不加入 UI / 页面 / 视觉资源。
3. 不加入 `package.json` 或 `package-lock.json`。
4. 不加入 `work/`、zip、临时文件。
5. 不加入删除文件。
