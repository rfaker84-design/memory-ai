# 忆见指标与成本事实合同 v1

状态：Staging candidate；生产环境启用需另行完成财务与隐私审查。  本合同不改变任何用户可见流程、套餐、价格或 Provider 行为。

## 1. 不可混淆的事实边界

| 事实/指标 | 权威来源 | 可历史回填 | 去重与窗口 | 覆盖起点 | 已知限制 |
| --- | --- | --- | --- | --- | --- |
| 人物创建成功 | `memories.created_at`，排除 `deleted_at` | 是 | 每个 `memory.id` 一次；创建日 | 现有领域数据起点 | 不代表用户完成后续体验 |
| 照片上传成功 | `product_interaction_events.photo_upload_succeeded` | 否 | `(environment,event_name,schema_version,canonical_subject,idempotency_key)` | `interaction_events` coverage | 旧媒体表不能准确表达“用户完成上传交互” |
| 首次影像请求 | `video_generation_jobs`，`use_case=first_presence` | 是 | 每个 job id；请求日 | 现有领域数据起点 | 任务不是观看 |
| 首次影像生成成功 | `video_generation_jobs.status=succeeded` | 是 | 每个 job id；当前以 `updated_at` 近似终态时间 | 现有领域数据起点 | 历史表没有 `terminal_at` |
| 影像价值到达 | `first_presence_video_played_3s` 交互事件 | 否 | 每位 Owner 的首个达标事件；真实播放累计 `elapsed_ms=3000` | `interaction_events` coverage | 绝不由 job succeeded、artifact 存在或 video 挂载推断 |
| 对话价值到达 | 首个 `memory_chat_turns.status=completed` | 是 | 每位 Owner 按 `(updated_at,id)` 首条 | 现有领域数据起点 | 仅说明 AI 回复已持久化 |
| 首次价值到达 | 以上两种中的任一项 | 部分 | 每位 Owner 取两类最早时间，保留 `video` / `chat` 子类型 | 各子来源 coverage | 视频历史只能从新采集起算 |
| 拾忆确认 | `long_term_memories.metadata.sourceKind=user_confirmed_pickup` | 是 | 每个 `long_term_memories.id` | 现有领域数据起点 | 仅用户确认保存，不读原文 |
| 付费页曝光 | `product_interaction_events.paywall_viewed` | 否 | 进入真实套餐页后的可见状态；主体隔离幂等 | `interaction_events` coverage | 不能从预加载、后台挂载或订单倒推曝光 |
| 支付、退款、复购 | `commerce_orders` / callback 去重表 | 是 | 一个 paid/refunded order；按 Owner 的付费排序，第二单起为复购 | 现有领域数据起点 | 未接入真实支付时不能作为财务结论 |
| 权益发放 | `memory_entitlements.status=active` | 是 | entitlement id | 现有领域数据起点 | 仅表示 durable entitlement row |
| 邀请合格/奖励 | `commerce_referral_qualifications` / `commerce_referral_rewards` | 是 | 唯一 invitee/reward cohort 约束 | 现有领域数据起点 | 邀请打开仍需新交互事件 |
| 首次触点 | `product_first_touch_attributions` | 否 | environment + Owner 或匿名 session | `first_touch` coverage | 不保存 URL query；匿名仅可合并到本人 |
| 成本 | `cost_ledger_entries` | 否（可导入账单校正） | environment + idempotency key；账本 append-only | `cost_ledger` coverage | `actual` 与 `estimated` 必须分开 |
| 投放花费 | `campaign_spend_imports` | 是（受控 CSV） | environment + idempotency key | `campaign_spend` coverage | 无导入时 CAC/回本显示不可计算 |

旧 `business_funnel_events` 仅用于旧漏斗兼容展示，不是本合同的真相源：它缺少 environment、匿名主体、schema version、properties allowlist 与 coverage 标记。

## 2. 统一口径

所有报告必须明确 `environment=staging|production`；默认不跨环境聚合。`product_metrics_subject_flags` 的 `synthetic` / `internal` 是唯一排除测试数据的正式方式，禁止通过手机号、人物称呼、姓名或内容筛选。

### 漏斗

`guest experience start → photo upload → memory create → first video request → video success → video played 3s → first AI reply → confirmed pickup → paywall view → first payment → repurchase`。

主转化率为：在窗口内**首次价值到达的独立用户**中，之后完成首个成功支付的独立用户 / 首次价值到达的独立用户。并行保留注册到支付、创建人物到支付、首次影像播放到支付、付费页曝光到支付，分母均只包括具有相应可观测来源的用户。

### 活跃与留存

活跃日只由以下可验证行为组成：完成 AI 回复、首次影像实际播放达 3 秒、已上传媒体、确认保存拾忆、或未来受控家庭协作完成。健康检查、刷新、静态资源与自动测试一律不算。

激活日是首个价值到达日；D1/D7/D30 仅在该日已过完整观察窗口后计算。尚未到观察日的 cohort 标记 `incomplete`，不以 0 留存处理。付费留存另以首付日作 cohort；家庭协作者留存当前阻塞于尚无 durable collaboration-completed 领域事实。

### 收入、成本与单位经济

GMV 为成功支付的订单金额；退款为 durable refunded order 金额；净实收为 GMV 减退款。ARPPU 以付费用户为分母；复购为同一 Owner 第二笔及后续成功订单，callback replay 不可形成新订单。

成本账本分类：`sms`、`llm_chat`、`video_generation`、`voice_generation`、`media_storage`、`payment_fee`、`manual_review_estimate`、`refund_cost`、`other_provider`。Provider 返回实际费用写 `actual`；仅有次数/tokens/秒数时，以 `cost_rate_cards` 的生效版本写 `estimated`；后续对账以新增补偿分录处理，禁止 UPDATE/DELETE 原分录。Staging mock 分录只能是 `environment=staging`、`amount_minor=0`、`is_mock=true`；绝不计入生产财务。

贡献毛利 = 净实收 - 非 mock provider/payment/review 成本；贡献毛利率在净实收为零时为不可计算。每激活/每付费用户成本、套餐毛利、CAC 与回本周期均在对应完整来源缺失时明确返回不可计算，绝不默认为 0。

## 3. 事件、隐私与保留

`product_interaction_events` 是 append-only 交互事实，当前仅采集：`guest_experience_started`、`photo_upload_succeeded`、`first_presence_video_played_3s` 与 `paywall_viewed`。API 只接受 schema v1 的事件判别联合；字段只包含内部 UUID、服务端时间/环境、受控 source、受控 event、最小 allowlist 维度和 synthetic 标志。匿名主体仅来自服务端签发的 HttpOnly `__Host` cookie；登录主体只来自正式 session。

禁止入表：手机号、验证码、聊天/AI 原文、人物称呼、姓名、生日、照片/音频/视频、URL、COS key、完整 IP、授权材料或其他自由文本。数据库列与 JSON allowlist 双重限制；API 拒绝额外字段。

`product_metrics_coverage` 由每个环境的显式部署写入实际 collector 上线时间。无法回填的事件在 coverage 前一律为未知，而非零。

原始交互、first-touch 与 subject flag 的保留期通过隐私/运营批准的 retention job 配置，当前未设置永久保留。账号删除的 online-content 阶段会删除这些可识别记录；匿名汇总不得再识别个人。财务订单与依法需保留的财务归档继续遵循现有 deletion/financial archive 合同，指标账本不得绕开该合同。

## 4. 报告与导入

```
npm run metrics:report -- --from YYYY-MM-DD --to YYYY-MM-DD --environment staging --format json
npm run metrics:report -- --from YYYY-MM-DD --to YYYY-MM-DD --environment staging --format csv
npm run metrics:import-spend -- --environment staging --file path/to/spend.csv
```

运行环境的 `DEPLOYMENT_ENV` 必须与 `--environment` 一致。报告按日期、first-touch 渠道和环境输出漏斗、留存、收入、退款、成本 basis、覆盖起点与 known limits。投放 CSV 仅接受 `channel,campaign,date,spend_minor,currency,source_reference,idempotency_key`；不得包含广告用户级数据。

## 5. 可计算性与当前缺口

当前可回填：人物创建、首次影像请求/成功、首个持久化 AI 回复、已确认拾忆、成功支付/退款/复购、权益、合格邀请与奖励。上线后可精确计算：游客体验开始、上传成功、首次影像实际累计播放 3 秒、付费页真实可见曝光。

仍不可完整计算：真实支付通道手续费、LLM/短信/视频/存储 Provider 实际费用、人工审核成本、媒体存储量、家庭协作完成、广告 spend/CAC/回本；原因是相应 durable provider bill、费用分录、协作完成事实或受控导入尚未存在。本合同不虚构这些值。

## 6. 验证门

每次发布至少验证：同一主体/事件/schema/key 的浏览器 retry 只留一条 interaction，不同主体的同 key 分别成立；payment callback replay 只对应一个 paid order；Worker retry 只留一个 cost idempotency key；mock 不进入 production；subject flag 排除 synthetic；D1/D7/D30 incomplete 不作零；actual 与 estimated 分开；迁移和 API 无敏感字段；coverage gap 可见。
