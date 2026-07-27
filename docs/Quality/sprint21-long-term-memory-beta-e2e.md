# Sprint21 长期记忆真实内测 E2E

日期：2026-07-27
分支：`sprint21/window-07-memory-voice-beta`

## 产品闭环

长期记忆能力仅在以下条件同时成立时可用：

- `MEMORYAI_DEPLOYMENT_TIER=internal-beta`
- `MEMORYAI_BETA_DATA_SCOPE=isolated-test`
- `MEMORYAI_LONG_TERM_MEMORY_BETA_ENABLED=true`
- Session 的 `externalUserId` 精确命中测试账号白名单

任一条件缺失时入口不显示、API 返回 `BETA_NOT_AVAILABLE`，聊天路径不读写长期记忆。公开生产环境默认关闭，未连接生产用户数据，也未修改支付或购买路径。

获准测试账号可以完成真实产品闭环：

1. 聊天消息先以幂等事务写入 PostgreSQL。
2. 聊天完成后从用户原话提取可记忆内容并写入 `long_term_memories`。
3. 后续问题按相关性、重要度和更新时间召回。
4. 用户可以在 TA 页面查看长期记忆。
5. 用户可以纠正内容；系统重算哈希并记录 `userCorrected`。
6. 用户可以删除内容；删除后不再被召回。
7. API 与 SQL 查询都以 Session 所有者和 `memoryId` 双重约束，客户端不传用户 ID。

## 真实数据库 E2E

命令：

```text
npm run test:long-term-memory-postgres-e2e
```

结果：`1/1` 通过。

测试启动一次性内存隔离的 PostgreSQL 18.3（PGlite 0.5.4），仅监听 `127.0.0.1` 随机端口，并通过 PostgreSQL wire protocol 连接仓库现有 `pg` 数据访问层。测试应用仓库 `001` 至 `013` 全量迁移，写入合成用户和合成记忆对象，不连接任何生产或共享数据库。

实际断言顺序：

1. 调用真实 `memory-chat` handler。
2. PostgreSQL 中产生 2 条消息和 1 条长期记忆。
3. 通过真实 `LongTermMemoryService` 召回该内容。
4. 通过真实长期记忆 API handler 查看该内容。
5. 通过 PATCH 纠正内容，并再次召回纠正后的内容。
6. 通过 DELETE 删除内容。
7. 删除后召回为空，长期记忆表记录为 0，原聊天消息仍为 2。

生成回答使用确定性的隔离测试引擎，不访问外部模型；API、聊天事务、提取、持久化、召回、查看、纠正和删除均走产品实现与真实 PostgreSQL。

## 回归证据

- `npm run test:long-term-memory-beta`：通过（单元/契约测试及真实 PostgreSQL E2E）。
- `npm exec tsc -- --noEmit --pretty false`：通过。
- `npm run build`：通过。
- `git diff --check`：通过。

本提交不连接生产、不公开入口、不接支付，也不使用用户数据训练模型。
