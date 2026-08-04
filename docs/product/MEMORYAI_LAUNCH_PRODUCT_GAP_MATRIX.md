# 忆见首发产品差异矩阵

本矩阵与 `MEMORYAI_LAUNCH_PRODUCT_RULES_V1.md` 配套；该规则源优先于所有历史产品叙述。状态只能使用规则源定义的七种值；`IMPLEMENTED_NOT_REAL_E2E` 不代表 Staging、真实设备或生产验收。

## 2026-08-04 分享边界复审

P-17 仍为 `PARTIAL`，但候选代码现已明确：仅人工审核通过、已结算、非 `first_preview` 且 `save_allowed=true` 的影像可创建或继续提供公开链接。每次公共元数据和播放读取都会重复该条件；首个 `saveAllowed=false` 影像不能分享。公开路由保持 noindex、无缓存、仅在线播放且不暴露 Provider 或对象存储键。Owner 可显式开启带 `AI Generated | MemoryAI` 标识的下载；每次开启、读取和最终审计均重新检查 Owner、审核、结算、可保存性和可见性 hold。派生文件只存在于私有临时目录并在 `finally` 删除，不创建对象键；审计失败绝不返回文件。Migration 021 仍未获 Staging 批准或执行。

## 2026-08-04 免费聊天端侧边界复审

P-09 仍为 `PARTIAL`，但候选 `e23f7d0` 已将既有持久化日准入的两个可见结果接到 Web 与移动端：最后一条成功普通回复中的 `freeChatWarning` 显示一次中性次日提示；稳定 `FREE_CHAT_DAILY_LIMIT_REACHED` 429 显示当天普通对话暂停且安全陪伴可用。端侧不写入、猜测或绕过额度，也不显示购买、充值、订阅等转化文案。危机路径继续由服务端在普通准入和 Provider 调用之前短路。相关 Web/移动合同、TypeScript 和生产构建已通过；成本/负载校准、真实设备与 Staging 运行时证据仍未取得。

| ID | 冻结规则 | 当前证据 | 差异状态 | 后续动作 |
|---|---|---|---|---|
| P-01 | 18+、生日可改、无家人协作 | Owner-only profile API 与设置/创建页生日入口已接通；服务端按日历生日判断且聊天/创建要求当前合格生日与 consent。移动端资料读取失败时不显示旧值或本地成功，并提供显式的同一 Owner 状态重新读取。 | IMPLEMENTED_NOT_REAL_E2E | 仍需真实 UI/设备与 Staging 验收 |
| P-02 | 最多 3 TA、统一授权、无生死询问 | 服务端对第四个 TA 返回 409 且原 idempotency key 可安全重放；公开创建/补传页只显示照片并明示不录音或上传声音，原生选择器、移动上传适配器和创建/恢复合同均仅接受图片，先记录版本化统一授权确认。正式创建路径不含在世/离世询问或声音采集/克隆入口。 | IMPLEMENTED_NOT_REAL_E2E | 创建流程混入音频和旧任务恢复会在任何上传前拒绝；仍需真实 UI/设备与 Staging 验收。 |
| P-03 | 首 TA 一次免费首影像 | Commerce `first_preview` 账本已有 | IMPLEMENTED_NOT_REAL_E2E | 对照首次影像入口和失败释放 |
| P-04 | 固定 8 秒克制模板、不可保存 | 视频产品回归与模板已有 | IMPLEMENTED_NOT_REAL_E2E | 保留真实 Provider/人工审核为外部门 |
| P-05 | 轻量动画、reduced-motion、无重型 3D | quiet companion 与 motion fallback 已有；旧 3D 世界已退休。移动壳保留系统字号、可见键盘焦点、44px 返回/文本/头部/聊天发送触控目标；全局 reduced-motion 仍为静态安全网。 | IMPLEMENTED_NOT_REAL_E2E | 仍需真实 Android/设备、读屏和多字号验收。 |
| P-06 | 持续 AI 标识、来源可查看、无捏造 | 聊天安全管线与来源页已有 | IMPLEMENTED_NOT_REAL_E2E | 人工安全评估为外部门 |
| **P-07** | **“这句话不太像 TA”纠正入口和确认链** | 每条非安全 TA 回复均有入口；五类原因、用户补充、建议预览、确认后 Owner PATCH 已接通；历史消息没有写接口 | **IMPLEMENTED_NOT_REAL_E2E** | 已通过建议单测、Owner 范围 Memory PATCH 测试；仍需 UI/真实环境验收 |
| P-08 | 仅确认后拾忆、半屏编辑、自然归类 | 可达拾忆页以“忆见整理助手”明确标识：用户主动输入原话，最多自选一次自然追问，生成可编辑整理稿；确认前不写入，确认后以 `user_confirmed_pickup` 可追溯来源保存。聊天只读取该确认来源，编辑/删除 Owner 限定且删除后不再召回；页面展示原话、整理稿、叙述者和时间，并明确不读取相册、麦克风或录音 | IMPLEMENTED_NOT_REAL_E2E | 已有隔离 PG14.23 confirmation/replay/edit/delete 与产品回归；仍需真实 UI/Staging 验收 |
| P-09 | 免费聊天、成本测算上限、安全免费 | 候选 Migration 023（未进自动 runner）提供按中国自然日、Owner/TA/idempotency-key 绑定的持久化准入；生产型运行时必须显式配置日上限，满额返回稳定 429，最后一次普通免费回复只出现一次中性提示，Provider 失败释放预留；危机路径不预留、不扣费且不受日限额限制。隔离 PostgreSQL 14.23 已完成首次执行、重放、注入回滚、并发、陈旧预留恢复和连接归零门。 | PARTIAL | 日上限的真实成本/负载测算及 Staging 运行时证据仍未取得；023 继续不进入自动 runner。 |
| P-10 | 两轮有效对话后后续影像入口 | Web 仅在当前默认正式会话的两轮完整持久化 user/TA 对话后，于输入区后的自然停顿显示入口；客户端排除首句、空白、失败和重复，服务端再次只计默认会话完成轮次，旧非默认会话不能绕过；入口使用冻结文案且没有提示词或动作选择 | IMPLEMENTED_NOT_REAL_E2E | 已通过定向单测、路由边界与隔离 PG14.23；仍需真实 UI/Staging 验收 |
| P-11 | 49/99/199 永久额度、同账本 | `sprint21-commerce-contract.md` 一致 | IMPLEMENTED_NOT_REAL_E2E | 不新增账本 |
| P-12 | 合规退款说明 | 购买、退款中心、条款和投诉页共享冻结退款说明：正常发放且无质量/系统问题的数字权益不支持无理由退款；重复扣款、权益未到账、系统/Provider 失败、影像质量判废及平台/法律要求进入核验后退款或补发。正式接口不再接受新“未使用购买”无理由退款申请，并保留历史记录可读；候选 Migration 025 扩展 Commerce 退款原因以容纳明确的“权益未到账”请求，未进自动 runner | IMPLEMENTED_NOT_REAL_E2E | 本地 Commerce、退款文案和候选迁移合同待验证；支付渠道、平台/法律复核及真实环境 E2E 仍为独立门 |
| P-13 | 注销显示权益并不阻断 | 账户注销页在二次认证与明确确认后显示在线内容、Provider/COS、备份和财务最小化归档的独立时限；请求回执、任务进度、legal hold 范围提示、监护确认、Session 失效与幂等恢复均已接通。移动端“我的”现在可直接进入实际隐私/删除说明和帮助/安全说明，而不是只复述文案；资料或注销进度读取失败时只能显式重新读取，不能自动提交或伪造状态。退款或法定保全不会把内容重新用于产品；外部 Provider 删除只有收到可审计结果才会完成 | IMPLEMENTED_NOT_REAL_E2E | 已通过删除 UI/API、监护确认、时限上限、worker 合同、隐私/帮助回归与移动端可达性合同；仍需隔离 Staging 执行、Provider 回执和生产法务/会计复核 |
| P-14 | 3 人邀请、反作弊、独立来源 | 移动端在两轮有效对话后的影像机会页可读取、签发并复制服务端邀请码；未签发代码的 404 被视为可创建初始状态，其他错误仍失败关闭。页面明确说明分享不等于达标，不在设备侧写资格或额度。服务端只接受验证器输出的设备证明，并对新人、手机号、设备和三人奖励 cohort 去重 | IMPLEMENTED_NOT_REAL_E2E | 34 项移动端/Commerce/referral 合同、TypeScript 与 production build 已通过；真实设备证明、商户/真实设备及 Staging E2E 仍为独立外部门 |
| P-15 | 生日/节日奖励独立记账 | Candidate 020 extends the existing Commerce ledger; China-time 30-day/no-cross-year windows, owner-scoped offers/claim, durable claim/video idempotency, explicit `occasion_reward` selection, saveable artifact contract and failed-generation release. Mobile renders an open offer for any current TA with a confirmed photo, lets the Owner choose another photographed TA, and the owner API bypasses the two-round gate only for explicit `occasion_reward` (regular follow-up video remains gated). If the jobs/Commerce read is unavailable, the page exposes only an explicit read-only account-state refresh and never claims local eligibility or retries a submission. Isolated PG14.23 evidence was previously obtained | IMPLEMENTED_NOT_REAL_E2E | Keep 020 outside the automatic runner; Staging migration, real Provider/manual review and production evidence remain separate gates |
| P-16 | 克制问候和通用通知 | 每日首次打开的温和问候已有。浏览器通知权限现在仅在 Owner 视频状态确认 `initial_preview` 成功且正式会话有一轮完成对话后，以用户点击方式提出；锁屏文案固定为“忆见里有一份新的问候。”，不含 TA 名称或正文，用户当前会话拒绝后不再重复提示。旧推送接口继续 410，未发送或伪造通知 | PARTIAL | 真实设备权限、合规推送通道/退订、送达与频控证据仍未取得 |
| P-17 | noindex/revocable/view-only 分享 | 候选 Migration 021 及 Owner/公共路由提供 noindex、无缓存、撤销后立即失效和仅在线播放；创建与每次公共读取均要求人工审核通过、已结算、非 `first_preview` 且 `save_allowed=true`，不暴露 Provider/对象键。Owner-only PATCH/GET 下载路径在移动端和受保护 Web 设置页均已接通；水印副本仅临时生成、最终审计成功后才返回，且无持久对象键。 | PARTIAL | 021 仍需独立 Staging 批准；真实设备、公开链接和 Provider/生产运行时证据仍缺。 |
| P-18 | 多 TA 底部选择器 | 当前头像/姓名可打开共享底部选择器，Owner 已读取的 TA 列表内可手动设为主 TA；选择仅保存界面偏好，服务端仍重新校验 Owner 数据。 | IMPLEMENTED_NOT_REAL_E2E | 仍需真实 UI/设备与 Staging 验收。 |
| P-19 | 删除消息、fresh export、TA 删除确认 | fresh reauthentication export 与账户注销已存在；主 TA 列表提供显式 TA 删除确认，正式 DELETE 路由要求精确 `DELETE_MEMORY` 确认、Owner Session 和 Origin。聊天记录提供独立的显式清除确认：服务端在 Owner 范围内清除全部正文、排除 UI 与模型上下文，同时保留不含原文的外键账本引用；素材未清理、会话失效或网络不确定均不会显示删除成功 | IMPLEMENTED_NOT_REAL_E2E | 已通过聊天/TA 删除边界、TypeScript、production build 与安全回归；仍需真实 UI/Staging 验收 |
| P-20 | 危机、预授权升级、未成年人隔离 | 危机退出人格与授权队列已有 | IMPLEMENTED_NOT_REAL_E2E | 外部资源/值班/法律复核 |

## 外部或生产门

真实 Staging、真实 Vidu、短信/支付/商户、签名设备、法律与会计意见、Provider 删除回执、生产迁移和最终 GO 继续由控制面记录为 `PRELAUNCH_REQUIRED_DEFERRED_NOW` 或 `PRODUCTION_RELEASE_NO_GO`；它们不阻塞本矩阵中的本地代码工作。
