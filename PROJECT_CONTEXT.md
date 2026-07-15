# MemoryAI 项目交接上下文

## 产品定位

MemoryAI 面向中国大陆市场，通过获得授权的照片、声音、人生故事和记忆片段创建数字存在体。产品目标是长期、可信的数字人格陪伴，不把空白资料补写成事实。

## 正式技术架构

- 前端：Next.js 15 App Router、React、TypeScript。
- 服务端：Next.js Route Handler。
- 数据库：正式 PostgreSQL，通过 Service、Repository 和 PostgreSQL DataSource 分层访问。
- 私有媒体：腾讯云 COS，通过正式媒体 Service 访问。
- 认证：腾讯云短信验证码证明号码控制权；验证成功后查找或创建 PostgreSQL user，并由服务端签发 `__Host-memoryai_session` Cookie。
- Session Cookie：`Secure`、`HttpOnly`、`SameSite=Lax`、`Path=/`，不设置 `Domain`。
- 客户端脚本不能读取长期 Session 凭据，也不能提交客户端身份字段来替代服务端所有权判断。
- 状态变更请求必须通过统一 Origin 校验。

## 正式 API 白名单

静态路径：

- `/api/auth/logout`
- `/api/auth/send-code`
- `/api/auth/session`
- `/api/auth/verify-code`
- `/api/health`
- `/api/health/ai`
- `/api/health/database`
- `/api/memories`
- `/api/media/upload`
- `/api/memory-chat`

结构化动态路径：

- `/api/memories/{id}`
- `/api/memories/{id}/chat-session`
- `/api/media/{id}`

其他 `/api/**` 路由统一返回 `410 LEGACY_ROUTE_UNAVAILABLE`，不得在返回前查询数据、调用供应商或修改状态。

## 正式 Memory 与 Chat 链路

```text
Route Handler
→ MemoryService / ChatService
→ Repository
→ PostgreSQL DataSource
→ PostgreSQL
```

Memory、Chat Session 和 Media 所有权均从服务端验证后的 Session 派生。跨用户访问不得泄露资源是否存在。

## 部署边界

- 唯一 PM2 应用名：`memoryai`。
- Next.js 仅监听 `127.0.0.1:3000`。
- Nginx 是唯一入口，并必须覆盖 `X-Real-IP`。
- 只有确认回环监听与 Nginx 转发契约后，才能启用可信代理配置。
- Redis 仅加入 Compose 内部网络，不向宿主机发布 6379。
- 不恢复 Supabase 正式生产链路。

## 安全与测试要求

- 不记录号码、验证码、Session 凭据、数据库连接串或云服务密钥。
- 认证响应和 legacy 410 响应强制 `private, no-store`。
- 构建阶段不得初始化外部客户端或建立外部 TCP 连接。
- 006 migration 的真实 PostgreSQL 14 矩阵必须从全新数据库完整执行。
- 发布前必须执行 API 白名单、Session 所有权、启动监听、secret scan、TypeScript、lint 和标准 build 检查。
