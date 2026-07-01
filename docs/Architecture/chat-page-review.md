# Chat Page Review

## 当前存在的聊天相关页面

| 页面 | 路径 | 主要职责 |
| --- | --- | --- |
| memory-chat | `app/memory-chat/[id]/page.tsx` | 单一 Memory 聊天页面。加载 Memory 信息、时间线事件、记忆碎片、聊天消息，提供向 AI 发送问题的输入框。 |
| dialogue | `app/(dialogue)/dialogue/page.tsx` | 通用对话页面。通过场景配置选择 Memory，发送 AI 聊天请求。 |
| voice-chat | `app/voice-chat/[id]/page.tsx` | 语音聊天页面。加载聊天消息并提供语音交互入口。 |

## 每个页面 Supabase / LLM 状态

| 页面 | 直接调用 supabase.from() | 直接调用 LLM |
| --- | --- | --- |
| memory-chat | **是** — `chat_messages`、`memories`、`timeline_events`、`memory_fragments` | **否**（通过 `/api/memory-chat` 间接调用） |
| dialogue | **否**（已全部使用 fetch API） | **否**（通过 `/api/memory-chat` 间接调用） |
| voice-chat | **是** — `chat_messages` | **否**（通过 API 间接调用） |

## 当前改造可行性：memory-chat/[id]

### 为什么不能安全改造

`memory-chat/[id]/page.tsx` 的所有操作基于 `memoryId`：

- `loadMessages()`：`supabase.from("chat_messages").select("*").eq("memory_id", id)`
- `loadData()`：`supabase.from("memories").select("*").eq("id", id)`
- `loadData()`：`supabase.from("timeline_events").select("*").eq("memory_id", id)`
- `loadData()`：`supabase.from("memory_fragments").select("content, source_type").eq("memory_id", id)`
- 页面 URL 参数是 `params.id`，即 `memoryId`

新 Chat API 的所有路由基于 `sessionId`：
- `GET /api/chat-sessions/[id]/messages` — `id` 是 `sessionId`
- `POST /api/chat-sessions/[id]/messages` — `id` 是 `sessionId`

当前数据库状态：
- 现有 `chat_messages` 表按 `supabase_mvp_schema.sql` 创建，**没有 `session_id` 字段**
- `chat_sessions` 表尚未在数据库中创建
- 没有任何代码路径将 `memoryId` 映射为 `sessionId`

**如果强行将 `memoryId` 传给 Chat API 的 `sessionId` 参数，API 会按 `session_id` 字段查询 `chat_messages`，对所有历史消息返回空数组。这属于破坏性改造。**

### 不改造说明

本次任务不改造 `memory-chat/[id]/page.tsx`。

原因：
1. 页面按 `memoryId` 工作，新 Chat Domain 按 `sessionId` 工作
2. 数据库尚未执行 `001_create_chat_tables.sql` 和 `002_alter_chat_messages_for_sessions.sql`
3. 强行改造会破坏现有功能

## 推荐统一方向

### 过渡方案（memoryId → sessionId）

1. **执行 SQL 迁移**：按 `docs/Deployment/chat-database-apply-guide.md` 在 Supabase 上执行迁移，创建 `chat_sessions` 表并为 `chat_messages` 补充 `session_id` 字段。
2. **建立映射逻辑**：在 `ChatService` 层增加 `getOrCreateSession(memoryId)` 方法，确保每个 Memory 至少有一个默认 session。
3. **页面改造**：
   - 页面首次加载时，调用 `GET /api/chat-sessions?userId=xxx&memoryId=xxx` 获取或创建 session
   - 将 `sessionId` 存入页面 state，后续消息操作全部按 `sessionId` 调用
   - 历史消息通过 `GET /api/chat-sessions/[sessionId]/messages` 加载
   - 新消息通过 `POST /api/chat-sessions/[sessionId]/messages` 发送
4. **对话发送仍然走 `/api/memory-chat`**：Chat API 只负责消息存取，AI 回复由 Memory Engine 负责。

### 远期统一

三个聊天页面最终应统一为：
- **dialogue**：通用入口，支持多 Memory 场景切换
- **memory-chat**：单一 Memory 聊天，迁移到 Chat Domain 后与 dialogue 共享 ChatService
- **voice-chat**：语音增强，在其他聊天页面基础上叠加语音交互

待 Chat Domain 完整迁移后，`memory-chat` 和 `dialogue` 可考虑合并，`voice-chat` 作为非 UI 功能层集成。

## 当前页面状态总结

| 页面 | Supabase 直接访问 | LLM 直接调用 | 可安全改造 |
| --- | --- | --- | --- |
| memory-chat | `chat_messages`, `memories`, `timeline_events`, `memory_fragments` | 否 | **否**（需要先完成 session 迁移） |
| dialogue | 已全部使用 API | 否 | N/A（已改造完成） |
| voice-chat | `chat_messages` | 否 | **否**（同上原因） |
