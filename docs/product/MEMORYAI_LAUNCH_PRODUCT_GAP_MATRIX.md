# 忆见首发产品差异矩阵

本矩阵与 `MEMORYAI_LAUNCH_PRODUCT_RULES_V1.md` 配套；该规则源优先于所有历史产品叙述。状态只能使用规则源定义的七种值；`IMPLEMENTED_NOT_REAL_E2E` 不代表 Staging、真实设备或生产验收。

| ID | 冻结规则 | 当前证据 | 差异状态 | 后续动作 |
|---|---|---|---|---|
| P-01 | 18+、生日可改、无家人协作 | Owner-only profile API 与设置/创建页生日入口已接通；服务端按日历生日判断且聊天/创建要求当前合格生日与 consent | IMPLEMENTED_NOT_REAL_E2E | 仍需真实 UI/设备与 Staging 验收 |
| P-02 | 最多 3 TA、统一授权、无生死询问 | Commerce 合同已有 3 TA 约束；公开创建页已移除声音文件采集与克隆暗示 | PARTIAL | 继续核验创建界面、授权文案和真实 UI |
| P-03 | 首 TA 一次免费首影像 | Commerce `first_preview` 账本已有 | IMPLEMENTED_NOT_REAL_E2E | 对照首次影像入口和失败释放 |
| P-04 | 固定 8 秒克制模板、不可保存 | 视频产品回归与模板已有 | IMPLEMENTED_NOT_REAL_E2E | 保留真实 Provider/人工审核为外部门 |
| P-05 | 轻量动画、reduced-motion、无重型 3D | quiet companion 与 motion fallback 已有；旧 3D 世界已退休 | IMPLEMENTED_NOT_REAL_E2E | 真实 Android/设备验收 |
| P-06 | 持续 AI 标识、来源可查看、无捏造 | 聊天安全管线与来源页已有 | IMPLEMENTED_NOT_REAL_E2E | 人工安全评估为外部门 |
| **P-07** | **“这句话不太像 TA”纠正入口和确认链** | 每条非安全 TA 回复均有入口；五类原因、用户补充、建议预览、确认后 Owner PATCH 已接通；历史消息没有写接口 | **IMPLEMENTED_NOT_REAL_E2E** | 已通过建议单测、Owner 范围 Memory PATCH 测试；仍需 UI/真实环境验收 |
| P-08 | 仅确认后拾忆、半屏编辑、自然归类 | 确认拾忆已有；半屏/归类需核验 | PARTIAL | 对照 UI 与数据模型 |
| P-09 | 免费聊天、成本测算上限、安全免费 | 安全/额度边界已有 | PARTIAL | 配置必须待真实成本测算 |
| P-10 | 两轮有效对话后后续影像入口 | Web 仅在当前默认正式会话的两轮完整持久化 user/TA 对话后，于输入区后的自然停顿显示入口；客户端排除首句、空白、失败和重复，服务端再次只计默认会话完成轮次，旧非默认会话不能绕过；入口使用冻结文案且没有提示词或动作选择 | IMPLEMENTED_NOT_REAL_E2E | 已通过定向单测、路由边界与隔离 PG14.23；仍需真实 UI/Staging 验收 |
| P-11 | 49/99/199 永久额度、同账本 | `sprint21-commerce-contract.md` 一致 | IMPLEMENTED_NOT_REAL_E2E | 不新增账本 |
| P-12 | 合规退款说明 | Refund Center/合同存在 | PARTIAL | 对外文案与平台/法律复核 |
| P-13 | 注销显示权益并不阻断 | 删除候选与财务归档已有 | PARTIAL | 连接权益视图并保持外部删除门 |
| P-14 | 3 人邀请、反作弊、独立来源 | Commerce referral 已有 | PARTIAL | 保留真实设备证明外部门 |
| P-15 | 生日/节日奖励独立记账 | Candidate 020 extends the existing Commerce ledger; China-time 30-day/no-cross-year windows, owner-scoped offers/claim, durable claim/video idempotency, explicit `occasion_reward` selection, saveable artifact contract, failed-generation release, and isolated PG14.23 first/replay/rollback/concurrency/postflight PASS | IMPLEMENTED_NOT_REAL_E2E | Keep 020 outside the automatic runner; Staging migration, real Provider/manual review and production evidence remain separate gates |
| P-16 | 克制问候和通用通知 | 每日问候已有 | PARTIAL | 核验通知授权时机与文案 |
| P-17 | noindex/revocable/view-only 分享 | 旧分享隔离；正式分享需核验 | PARTIAL | 审计分享路由/契约 |
| P-18 | 多 TA 底部选择器 | 主 TA 切换已有 | PARTIAL | 核验底部选择器体验 |
| P-19 | 删除消息、fresh export、TA 删除确认 | 账户导出/注销已有 | PARTIAL | 审计消息删除与 TA 删除 UI |
| P-20 | 危机、预授权升级、未成年人隔离 | 危机退出人格与授权队列已有 | IMPLEMENTED_NOT_REAL_E2E | 外部资源/值班/法律复核 |

## 外部或生产门

真实 Staging、真实 Vidu、短信/支付/商户、签名设备、法律与会计意见、Provider 删除回执、生产迁移和最终 GO 继续由控制面记录为 `PRELAUNCH_REQUIRED_DEFERRED_NOW` 或 `PRODUCTION_RELEASE_NO_GO`；它们不阻塞本矩阵中的本地代码工作。
