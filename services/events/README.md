# MemoryAI Event Bus

采用 Publish / Subscribe 架构。

以后所有模块：

- Chat
- Memory
- Voice
- Avatar
- Payment
- Analytics
- Audit

全部通过 EventBus 通信。

禁止模块互相直接依赖。
