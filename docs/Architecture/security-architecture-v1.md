# 忆见安全架构 V1

## 1. 总览

MemoryAI（忆见）安全架构 V1 由四层组成：

- 审计日志
- 权限检查
- 风险控制
- 授权合规

四层共同构成 Sprint10 已完成的安全底层：审计日志负责记录关键行为，权限检查负责访问边界，风险控制负责识别高风险输入与事件，授权合规负责确认特定 Memory 是否具备指定授权。

## 2. 审计日志

审计日志链路：

```text
AuditService → AuditRepository → AuditSupabaseDataSource → audit_logs
```

已接入：

- 创建记忆
- 聊天消息
- AI 回复
- critical 风险

审计日志用于保留关键行为轨迹，为后续后台查看、安全追踪、合规审查和异常分析提供基础。

## 3. 权限检查

权限检查链路：

```text
PermissionService → PermissionRepository → PermissionSupabaseDataSource
```

已支持：

- Memory 权限
- Chat Session 权限
- Media 权限

已接入：

- 聊天消息 API
- 记忆列表 API 自带 userId 过滤

权限检查用于确保用户只能访问其被允许访问的 Memory、Chat Session 与 Media 资源。

## 4. 风险控制

风险控制链路：

```text
RiskDetector → RiskService → RiskRepository → RiskSupabaseDataSource → risk_events
```

已接入：

- 聊天消息 API

当前策略：

- 只记录，不阻断

风险控制当前用于识别并记录风险事件，为后续策略升级、限流、拦截和后台运营提供依据。

## 5. 授权合规

授权合规链路：

```text
ConsentService → ConsentRepository → ConsentSupabaseDataSource → consent_records
```

已支持授权类型：

- 亲人资料
- 素材
- 声音克隆
- AI形象
- 数字人
- 商业使用

授权合规用于判断某个 Memory 是否具备指定授权，是后续接入真实语音、数字人、商业使用等高合规风险能力的前置条件。

## 6. 当前限制

- RLS 暂未完整开启
- 风险控制当前只记录不拦截
- 授权合规尚未接入具体业务入口
- 审计日志未接入后台查看
- 缺少限流架构

## 7. 下一步

- Sprint11 部署运维架构
- Sprint12 限流与后台运营
- 后续接入真实语音/数字人前必须先接授权校验
