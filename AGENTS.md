# MemoryAI AI Coding Agent Entry

所有 AI Coding Agent 在执行任务前必须读取：

1. `docs/Blueprint/MemoryAI_Master_Blueprint.md`
2. `docs/Governance/MEMORYAI_PROJECT_CONTEXT.md`
3. `docs/Governance/MEMORYAI_ENGINEERING_RULES.md`
4. `docs/Governance/MEMORYAI_DESIGN_SYSTEM.md`
5. `docs/Governance/MEMORYAI_MOTION_SYSTEM.md`

规则：

- 当前任务明确指令优先。
- 禁止绕过 Governance 文档。
- 禁止自由改变产品方向。
- 禁止自由改变架构。
- 禁止自由改变设计方向。
- 禁止自由改变 Motion 方向。

如果任务与 Architecture Freeze 冲突：

- 停止扩大修改。
- 报告冲突。
- 等待决策。

注意：

- 不要删除 AGENTS.md 原有有效规则。
- 只进行兼容性合并。
