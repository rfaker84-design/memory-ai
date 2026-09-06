# MemoryAI Master Blueprint

## 0. 当前决策入口（2026-09-06）

本节是本文件的当前摘要；下方 Sprint00–15 记录保留为历史，不能将旧快照当作当前产品指令或现网状态。当前任务明确指令仍优先；架构分层、安全边界与既有审批规则继续有效。

| 范围 | 当前基准 | 依据 |
| --- | --- | --- |
| 产品 | 私人 AI 关系记忆空间；TA 可为生活中的重要之人，不预设死亡，不宣称真人意识 | Owner 近期产品决策；2026-09-06 审查及修复授权 |
| 用户主链 | 公开浏览，主动创建/上传/发言/保存时确认会话；登录后承接同一次动作；仅使用正式 Owner 数据 | `components/world/GuestPublicSurface.tsx`；`src/components/auth/guestActionContinuation.ts` |
| 人物选择 | 使用 Owner 范围的主人物选择；多人物不按最新创建自动抢占；新账户先创建 | `src/components/companion/companionHomeState.ts` |
| 记忆 | 用户确认后才作为可引用资料；原话、整理稿和来源可追溯；普通聊天不自动变成确认记忆 | 拾忆路由；`features/memory-engine/confirmed-memory-sources.ts` |
| 影像与权益 | 首个符合条件 TA 免费首次预览，不要求先聊天、不扣次数、不可保存；后续影像另满足两轮有效聊天等条件；49/99/199 元对应永久 2/6/15 次；审核成功才扣，失败释放 | 现有 Commerce、Video 合同；`app/help/page.tsx#entitlements` |
| 视觉与导航 | 保留当前五人首页视频资产及布局；暖象牙纸张与自然生活影像构成二级页；首页/相伴/拾忆/我的四入口 | 当前批准页面与 `PublicProductNavigation.tsx`；本任务仅作具体可读性/交互修复 |
| 声音与音乐 | 声音复刻仅受控 Staging internal beta，默认关闭；音乐按当前暂停决定处理 | 当前供应商开关和 2026-09-02 后决策；不以旧音乐规格判断缺陷 |
| 技术 | Next.js 15 / React 19 / TypeScript；Feature→Service→Repository→DataSource；正式 PostgreSQL、私有 COS；Supabase 为历史兼容/导出适配器 | Sprint15A 后正式服务及数据源；不得另建架构 |
| 运行环境 | 源码、构建、Staging 运行、Production 必须分别举证；固定 Node 20.20.2 / npm 10.8.2 | `package.json`；不可变发布合同 |
| 上线状态 | 本修复不构成商业上线批准；服务器/Worker/Schema/备份/回滚/真实业务验收缺项必须如实标记 | `docs/product/MEMORYAI_LAUNCH_ACCEPTANCE.yaml`；修复验收记录 |

工程入口仍为 `AGENTS.md` 和五份必读文档。历史模块名（如 Subscription）不是恢复订阅计费的依据；历史深色规格不是把批准暖象牙页面改回深色的依据。技术栈清单也不等于第三方服务已经配置或公开开放。

## 历史架构与 Sprint 记录（保留溯源）


## 1. Project Vision
历史占位；当前产品方向见第 0 节。

---

## 2. Product Position
历史占位；当前产品定位见第 0 节。

---

## 3. System Architecture

Current technical stack summary based on Sprint00 project audits:

- Application framework: Next.js App Router project under `app/`.
- Language/runtime: TypeScript, React 19, Next.js 15.
- Styling/tooling: Tailwind CSS 4, PostCSS, ESLint, TypeScript.
- 3D/animation/UI runtime: Three.js, React Three Fiber, Drei, Postprocessing, Framer Motion.
- AI/service integrations: OpenAI SDK, Tencent Cloud ASR/TTS SDKs, Tencent COS SDK.
- Database/backend integration: Supabase JavaScript SDK, PostgreSQL client dependency `pg`.
- Deployment/runtime files present in project root include `Dockerfile`, `docker-compose.yml`, `vercel.json`, and `ecosystem.config.js`.
- Current build command is `npm run build`, mapped to `next build`.

---

## 4. Project Directory

Current standard project root:

```text
C:\Users\Administrator\MemoryAi
```

Current directory summary based on workspace and architecture audits:

- `app/`: Next.js App Router pages, layouts, route handlers, and app-local libraries.
- `app/api/`: API route handlers.
- `components/`: shared UI and product components.
- `src/`: source modules, libraries, server helpers, and internal product logic.
- `lib/`: additional library/service code.
- `public/`: static assets.
- `supabase/`: Supabase SQL and migration-related files.
- `docs/Blueprint/`: Master Blueprint documentation.
- `docs/Architecture/`: generated project architecture and asset audit documents.
- `docs/API/`: generated API route inventory.
- `docs/Database/`: generated database audit documentation.

Workspace cleanup status:

- The real MemoryAI project root is `C:\Users\Administrator\MemoryAi`.
- The accidental upper-level npm workspace under `C:\Users\Administrator` was cleaned in Sprint00.
- Future npm commands must be run from `C:\Users\Administrator\MemoryAi`.
- After cleanup, the previous Next.js multiple lockfiles warning no longer appears during build.

---

## 5. Database

Current database audit summary:

- Supabase environment variable names found in `.env.local`:
  - `NEXT_PUBLIC_SUPABASE_URL`
  - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
  - `SUPABASE_SERVICE_ROLE_KEY`
- Supabase client/server helper files found:
  - `src/lib/supabase.ts`
  - `src/server/supabaseAdmin.ts`
- Supabase usage appears across multiple `app/api/` route handlers and selected app pages.
- Static SQL and migration-related files exist, including root-level `supabase_*.sql` files and files under `supabase/migrations/`.
- Known tables are inferred from code only; this blueprint does not confirm live production schema state.
- Current inferred table usage includes memory, chat, avatar, project state, referral, payment, share, user/profile, voice, and timeline related tables.

Missing information that cannot be confirmed from code-only audit:

- Actual live table fields and column definitions.
- Current production RLS policies.
- Current production indexes.
- Current production foreign keys.
- Actual Supabase Storage bucket status and permissions.

Current database risks:

- Live database schema may differ from historical SQL files and current code assumptions.
- Multiple schema/migration SQL files make the authoritative database model unclear.
- RLS, indexes, foreign keys, and storage bucket permissions require formal verification/design.
- A formal CTO-approved V1 database model is required before further database expansion.

---

## 6. API Standard

Current API audit summary:

- API routes are implemented with Next.js App Router route handlers under `app/api/`.
- Generated route inventory is maintained in `docs/API/api-list.md`.
- Current API surface includes admin, analytics, auth, avatar, chat, memory, payment, referral, sharing, voice, TTS/STT, subscription, notification, and world/config endpoints.
- Dynamic API routes currently include examples such as `/api/jobs/[id]`.
- Current API audit is an inventory only; no unified API request/response standard has been formally defined yet.

Required next API standardization work:

- Define a single response envelope format.
- Define error code and error message conventions.
- Define authentication/session requirements per route category.
- Define validation requirements for request bodies and query parameters.
- Define logging and observability expectations for API routes.

---

## 7. Module List
(TODO)

---

## 8. UI Design System
(TODO)

---

## 9. Development Rules
(TODO)

---

## 10. Deployment
(TODO)

---

## 11. Roadmap
(TODO)

---

## 12. Sprint Progress

| Sprint | Task | Status |
|---|---|---|
| Sprint00 | Task001 | Completed |
| Sprint00 | Task001-B | Completed |
| Sprint00 | Task002 | Completed |
| Sprint00 | Task003 | Completed |
| Sprint00 | Task003-B | Completed |
| Sprint00 | Task004 | Completed |
| Sprint00 | Task005 | Completed |
| Sprint00 | Task006 | In Progress |
| Sprint01 | Task001 | Completed |
| Sprint01 | Task002 | Completed |

---

## 13. Change Log

2026-06

Blueprint initialized in correct project root.

2026-06

Project audit and database audit synced into blueprint.
---

# Architecture Freeze V1

## Product Scope

MemoryAI V1 固定包含八个模块：

- M01 User
- M02 Memory
- M03 Chat
- M04 Dream Space
- M05 Avatar
- M06 Voice
- M07 Subscription
- M08 Profile

## Module Responsibility

- M01 User：负责用户身份、账户状态、登录注册与用户级权限边界。
- M02 Memory：负责记忆创建、存储、组织、检索、资产关联与长期记忆更新。
- M03 Chat：负责用户与 AI 的会话、消息流转、上下文注入与对话保存。
- M04 Dream Space：负责记忆空间、沉浸式场景、梦境化体验与空间状态呈现。
- M05 Avatar：负责数字分身生成、形象状态、任务追踪与展示入口。
- M06 Voice：负责语音输入输出、语音克隆、TTS/STT 与声音资产管理。
- M07 Subscription：负责订阅状态、权益判断、付费能力与商业化访问控制。
- M08 Profile：负责用户资料、偏好、陪伴设置、个性化状态与展示信息。

## Core Domain

固定核心实体：

- User
- Profile
- Memory
- MemoryAsset
- Conversation
- Message
- Voice
- Avatar
- Subscription
- Consent

## Navigation

一级页面固定：

- Home
- Chat
- Memory
- Profile

## AI Flow

固定：

```text
User Input
↓
Memory Context
↓
Long-term Memory
↓
Prompt Builder
↓
LLM
↓
AI Response
↓
Save Conversation
↓
Memory Update
```

## Layer Architecture

固定：

```text
UI
↓
Feature
↓
Service
↓
Database / AI Provider
```

## Development Principles

1. Feature First
2. Service Layer Required
3. Blueprint First
4. Build Must Pass
5. Main Branch Always Deployable

2026-06

Architecture Freeze V1 completed.



2026-06

Chat schema decision: chat_sessions + chat_messages.

2026-06

Chat API implemented. SQL pending manual Supabase execution.

2026-06

Memory Engine initialized.

2026-06

LLM_PROVIDER controls active LLM provider. Default is mock.

2026-06

Event Architecture initialized.

2026-06

Event types standardized for MemoryAI V1.

2026-06

Global EventBus singleton initialized.

2026-06

Media Architecture initialized.

2026-06

Storage Provider abstraction initialized. Default provider is local.

2026-06

Media schema designed. SQL pending manual execution.

2026-06

Media database apply guide created. SQL pending execution.

2026-06

AI Provider Architecture initialized.

2026-06

LLM providers can now be adapted into AI Provider Registry.

2026-06

Global AI Provider Registry initialized.

2026-06

Memory Engine now resolves LLM through AI Provider Registry.

2026-06

TTS Provider abstraction initialized.

2026-06

Avatar Provider abstraction initialized.

2026-06

Embedding Provider abstraction initialized.

2026-06

Vision Provider abstraction initialized.

2026-06

OCR Provider abstraction initialized.

2026-06

Prompt Architecture initialized with layered prompt pipeline.

2026-06

Emotion Engine initialized with rule-based detector.

2026-06

长期记忆架构初始化完成。

2026-06

长期记忆数据库设计完成，SQL 待执行。

2026-06

审计日志架构初始化完成。

2026-06

审计日志数据库设计完成，SQL 待执行。

2026-06

权限架构初始化完成。

2026-06

风险控制架构初始化完成。

2026-06

风险事件数据库设计完成，SQL 待执行。

2026-06

授权合规架构初始化完成。

2026-06

授权合规数据库设计完成，SQL 待执行。

2026-06

授权校验能力初始化完成。

2026-07

安全架构 V1 收口完成。

2026-07

生产部署架构 V1 初始化完成。

2026-07

日志与备份架构 V1 初始化完成。

2026-07

健康检查架构初始化完成。

2026-07

发布与回滚架构 V1 初始化完成。

2026-07

V1 平台架构总验收文档创建完成。

2026-07

V1 平台架构冻结声明创建完成。

2026-07

## MemoryAI Project Governance Baseline

状态：ACTIVE

文档：

- `docs/Governance/MEMORYAI_PROJECT_CONTEXT.md`
- `docs/Governance/MEMORYAI_DESIGN_SYSTEM.md`
- `docs/Governance/MEMORYAI_MOTION_SYSTEM.md`
- `docs/Governance/MEMORYAI_ENGINEERING_RULES.md`

AI Coding Agent Entry：

- `AGENTS.md`

Architecture Freeze：UNCHANGED

2026-07

Provider Architecture Controlled Rewire completed.

Memory Chat route now uses frozen MemoryEngineService / Provider architecture.

TTS route now uses frozen TTS Provider architecture.

No final commercial provider selection made.

Volc/Ark integration pending.

Volc BigTTS integration pending.

Architecture Freeze unchanged.

2026-07

Create Memory Architecture Controlled Rewire completed.

Create Memory UI now creates memories through app/api/memories route.

Memory creation route uses frozen MemoryService / MemoryRepository / MemorySupabaseDataSource architecture.

Create Memory page no longer imports Supabase client or writes directly to Supabase.

Architecture Freeze unchanged.

2026-07

Sprint13B Motion Runtime Foundation completed.

Unified Motion Runtime foundation created under `src/motion/`.

Runtime supports requestAnimationFrame clock, scroll progress, scroll velocity, reduced motion, press feedback, reveal baseline, and dependency-free spring primitives.

No page integration performed.

No UI, API, database, deployment, package, GSAP, Lenis, or Three.js changes made.

2026-07

Sprint13C Core Components Foundation completed.

Shared MemoryAI core component foundation created under `src/components/memory-ui/`.

Components use `src/design` tokens and `src/motion` hooks where interactive.

No page integration performed.

No UI rewrite, API, database, deployment, package, or existing page changes made.


2026-07

Sprint14 Home Entry Lock and Cinematic Product Shell completed.

The canonical product homepage is locked to `/`; legacy splash/world entry routes now redirect to the single homepage or the formal memory-world entry.

The homepage uses Sprint13 design, motion, and memory-ui foundations; it supports loading, empty, ready, error, and unauthenticated states without introducing new API, database, SQL, package, or provider changes.

Production acceptance evidence is tracked in `docs/Deployment/sprint14-home-entry-online-acceptance.md`.

2026-07

Sprint15A China PostgreSQL Foundation completed.

The formal production memory and conversation data paths now use `MemoryPostgresDataSource` and `ChatPostgresDataSource` behind their frozen Service / Repository boundaries with a server-side PostgreSQL pool. Database health now verifies PostgreSQL with `SELECT 1`; Supabase is retained only as a legacy adapter outside these selected formal paths and for historical export.

Self-hosted PostgreSQL is bound to loopback on the existing Tencent CVM. Idempotent core schema migrations, least-privilege runtime access, daily/weekly backups, restore drills, and resource monitoring are established.

No Sprint14 visual, Motion, provider, or product-shell code was changed.
