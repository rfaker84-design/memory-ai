# MemoryAI（忆见）工程执行规范

文档状态：ACTIVE

规范级别：ENGINEERING BASELINE

---

## 1. Architecture Freeze

当前平台架构已冻结。

禁止：

- 替换 Next.js
- 改变 App Router
- 创建第二套数据访问架构
- 绕过 Repository Pattern
- 绕过 Service Layer
- 大规模目录重构
- 批量重命名
- 无任务依据的代码清理

---

## 2. 修改边界

每个任务执行前必须确定：

- Task Scope
- Allowed Files
- Protected Files
- Validation Plan

只修改任务必要文件。

如果发现无关问题：

- 记录。
- 报告。
- 不得顺手修改。

---

## 3. Protected Areas

以下区域默认属于高风险区域：

- 数据库 Schema
- Migration
- Authentication
- Repository Layer
- Service Layer
- API Contract
- Production Environment
- Nginx
- PM2
- Deployment Script
- Secrets
- Environment Variables

除非任务明确要求：

不得修改。

---

## 4. 依赖管理

禁止因为个人偏好替换依赖。

新增依赖前必须确认：

- 现有依赖无法满足需求。
- 依赖仍在维护。
- 支持当前 Next.js。
- 支持生产构建。
- 不会明显增加客户端 Bundle。

禁止一次任务引入多个功能重叠库。

---

## 5. TypeScript

正式代码禁止：

- 无理由 `any`
- 无理由 `@ts-ignore`
- 无理由 `eslint-disable`
- 通过关闭检查解决构建错误

类型错误必须解决根因。

---

## 6. React / Next.js

默认遵循 App Router。

明确区分：

- Server Component
- Client Component

禁止无理由添加：

`"use client"`

客户端组件必须控制边界。

禁止将整个页面因为单一交互变成大型 Client Component。

---

## 7. 状态管理

状态必须放在正确层级。

禁止：

- 重复状态
- 派生状态重复保存
- 全局状态滥用
- Context 滥用
- 组件之间通过 DOM 查询同步状态

---

## 8. API

不得无任务依据修改现有 API Contract。

API 必须处理：

- 参数验证
- 错误状态
- 权限
- 异常
- 日志边界

禁止将内部错误完整暴露给客户端。

---

## 9. 数据

禁止正式页面使用假数据冒充真实功能。

允许 Mock 的任务必须明确标记。

禁止：

- 硬编码 `userId`
- 硬编码 `memoryId`
- 硬编码生产业务数据

---

## 10. Secrets

禁止提交：

- API Key
- Service Role Key
- 数据库密码
- Token
- 私钥

Secrets 只能通过环境变量或正式 Secret 管理机制提供。

---

## 11. 性能

必须关注：

- Client Bundle
- Hydration
- Rerender
- Image Size
- Font Loading
- WebGL Cost
- Network Request
- API Latency

禁止为了视觉效果无限增加客户端负载。

---

## 12. Mobile

核心功能必须检查：

- 375px viewport
- 390px viewport
- 430px viewport
- 触摸交互
- 软键盘
- Safe Area
- 底部导航
- 长文本
- 慢网络状态

---

## 13. 构建验证

每个正式开发任务结束前至少执行：

```bash
git diff --check
npm run build
```

如果项目存在相关 lint、test、typecheck 命令：

执行与当前任务相关的验证。

禁止在 build 失败状态报告任务完成。

---

## 14. Git

执行前检查：

```bash
git status
```

执行后检查：

```bash
git diff
```

禁止：

- `git reset --hard`
- `git clean -fd`
- 强制覆盖未知用户改动
- 删除未知文件

除非任务明确授权。

---

## 15. Production

生产环境：

`yijianmemory.cn`

生产部署相关任务必须验证：

- PM2 状态
- Nginx 状态
- HTTPS
- 目标页面 HTTP 状态
- 关键 API 状态

如果任务要求部署：

必须基于当前正式部署链路执行。

不得创建第二套部署方式。

---

## 16. AI Coding Agent 报告格式

任务完成后必须使用以下格式：

- Task
- Status
- Changed Files
- Implementation
- Validation
- Build Result
- Production Result
- Risks
- Next Recommended Task

禁止使用：

- 应该完成
- 理论可用
- 大概正常
- 可能已经修复

必须报告真实执行结果。
