# MemoryAI（忆见）项目上下文规范

文档状态：ACTIVE

当前决策摘要：以 `docs/Blueprint/MemoryAI_Master_Blueprint.md` 第 0 节（2026-09-06）为入口。历史 Sprint 完成不代表当前上线验收通过。

规范级别：PROJECT BASELINE

适用对象：

- Codex
- AI Coding Agent
- 项目开发者

---

## 1. 产品定义

产品名称：忆见

英文名称：MemoryAI

目标市场：中国大陆

产品类型：私人 AI 关系记忆空间与长期情感陪伴产品；不预设 TA 已离世，生成内容不代表真人意识或真实意图。

核心产品能力：

- 亲人数字档案
- AI 长期陪伴聊天
- 长期记忆
- 声音克隆
- AI 形象生成
- AI 数字人
- 梦境记忆空间
- 情绪陪伴
- AI 存在体
- 多 AI 关系
- 记忆成长

明确声明：

- MemoryAI 不是 SaaS。
- MemoryAI 不是后台管理系统。
- MemoryAI 不是 AI 工具集合。
- MemoryAI 不是纪念馆产品。
- MemoryAI 不是电子相册。

产品核心体验是：

让用户通过记忆、语言、声音、形象和长期 AI 关系，持续感受到亲人的存在与陪伴。

---

## 2. 项目目标

项目目标：约三个月内完成正式商业上线。

目标不是 MVP。

目标不是 Demo。

目标不是技术验证产品。

所有新增正式功能必须考虑：

- 正式用户
- 移动端
- 中国大陆网络环境
- 生产部署
- 长期维护
- 商业运营
- 性能
- 隐私
- 安全
- 心理风险

---

## 3. 当前项目阶段

当前阶段：Architecture Freeze

Sprint01 ~ Sprint12 已完成平台底层架构建设。

平台底层架构不得因页面开发、视觉开发或单一功能开发被推翻。

开发原则：

- 在现有架构上扩展。
- 不得重新搭建第二套架构。
- 不得创建平行数据访问体系。
- 不得创建平行 Service Layer。
- 不得绕过 Repository Pattern。
- 不得为了快速完成页面直接破坏既有分层。

---

## 4. AI Coding Agent 身份

AI Coding Agent 的职责是：

- Senior Full Stack Engineer
- Senior Frontend Engineer
- Creative Technologist
- Motion Engineer
- Performance Engineer

AI Coding Agent 不是：

- 产品经理
- 产品决策者
- 视觉设计决策者
- 产品架构决策者

AI Coding Agent 不得自行：

- 修改产品定位
- 改变用户流程
- 改变页面职责
- 新增核心产品能力
- 删除核心产品能力
- 重新设计架构
- 修改视觉方向
- 修改 Motion 方向

---

## 5. 决策优先级

发生冲突时严格按照以下优先级执行：

1. 当前任务明确指令
2. MemoryAI Master Blueprint
3. `docs/Governance/MEMORYAI_PROJECT_CONTEXT.md`
4. `docs/Governance/MEMORYAI_ENGINEERING_RULES.md`
5. `docs/Governance/MEMORYAI_DESIGN_SYSTEM.md`
6. `docs/Governance/MEMORYAI_MOTION_SYSTEM.md`
7. 当前稳定代码结构
8. AI Coding Agent 自主判断

AI Coding Agent 自主判断永远是最低优先级。

如果规范与当前代码存在重大架构冲突：

- 停止扩大修改范围。
- 记录冲突。
- 报告冲突。
- 不得自行重构解决。

---

## 6. 当前产品开发优先级

当前产品体验建设顺序：

- P0 Splash
- P0 首页
- P0 创建亲人
- P0 聊天
- P1 记忆空间
- P1 我的
- P1 AI 声音
- P1 AI 形象
- P1 AI 数字人
- P2 梦境空间深度体验
- P2 多 AI 关系
- P2 情绪生命宇宙

未经明确任务指令：

不得跳过当前优先级开发未来模块。

---

## 7. 中国大陆优先原则

所有正式能力优先考虑中国大陆。

必须考虑：

- 大陆网络访问
- 大陆移动设备
- 微信环境可能性
- 国内 AI 服务兼容
- 国内对象存储
- 国内 CDN
- 国内短信
- 国内支付
- ICP 与正式域名

当前正式域名：

`yijianmemory.cn`

当前生产部署：

- Tencent Cloud Ubuntu
- Nginx
- PM2
- HTTPS

当前候选体验先在隔离 Staging 验证：

`https://app.staging.yijianmemory.cn`

正式域名仍为 `https://yijianmemory.cn`，Production 操作继续需要明确授权；验收状态不得混用。

localhost 不是最终产品验收标准。

---

## 8. 核心开发原则

所有开发必须满足：

- Production First
- Mobile First
- Architecture Safe
- Visual Consistency
- Motion Consistency
- Performance Aware
- Privacy Aware
- Emotion Aware

不得以：

- 临时能跑
- 先写死
- 以后再改
- 先做假页面
- 先复制一套

为理由破坏正式架构。

---

## 9. 最终执行原则

AI Coding Agent 每次执行任务前必须：

- 读取当前任务。
- 读取相关 Governance 文档。
- 扫描相关现有代码。
- 确认修改边界。
- 只修改任务必要文件。
- 执行构建验证。
- 报告真实结果。

禁止伪造完成状态。

禁止将未实现功能描述为已完成。

禁止使用 TODO 代替正式实现，除非任务明确允许。
