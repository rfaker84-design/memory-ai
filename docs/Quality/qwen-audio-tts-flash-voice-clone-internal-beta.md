# Qwen-Audio-3.0-TTS-Flash 声音复刻内测

范围：仅 `Staging` 的 isolated internal beta。此能力不会改变 Production 的 TTS Provider、部署配置、数据库或公开入口。

## 启用条件

Staging secret manager 必须同时提供以下精确值：

```text
DEPLOYMENT_ENV=staging
MEMORYAI_DEPLOYMENT_TIER=internal-beta
MEMORYAI_BETA_DATA_SCOPE=isolated-test
MEMORYAI_QWEN_AUDIO_TTS_FLASH_VOICE_CLONE_BETA_ENABLED=true
MEMORYAI_QWEN_AUDIO_TTS_FLASH_VOICE_CLONE_BETA_TEST_USER_IDS=<synthetic external user IDs>
DASHSCOPE_API_KEY=<staging-only DashScope key>
DASHSCOPE_VOICE_CLONE_ENDPOINT=https://<workspace>.cn-beijing.maas.aliyuncs.com/api/v1/services/audio/tts/customization
```

`TTS_PROVIDER` 保持 `mock`，因为声音复刻是独立的 server-side beta provider，不替换 Staging 主 TTS 契约。缺少任一条件时，API 以 `BETA_NOT_AVAILABLE` 失败关闭。即使错误地在 Production 设置了 beta flag，`DEPLOYMENT_ENV=production` 也会拒绝该能力。

## 测试流程

1. 使用白名单测试账号登录 Staging，并携带既有 Staging access header。
2. 访问 `/memory/<owned-memory-id>/voice-clone`；它不是公开导航入口。
3. 确认专属声音复刻授权，提交 WAV、MP3 或 M4A 样本。建议 10–20 秒；服务端限制 10 MB。
4. 服务端将样本保存至隔离 Staging 媒体存储，以短期签名 URL 仅供本次 Qwen 调用，并将结果写入该 owner-bound memory 的 `provider_jobs` 与声音字段。
5. 检查 201 响应的 `job.status=ready`。响应、日志与持久化 provider payload 不含样本 URL 或签名。

## 回滚

将 `MEMORYAI_QWEN_AUDIO_TTS_FLASH_VOICE_CLONE_BETA_ENABLED` 设为非 `true` 并按 Staging immutable runner 重新加载。API 会立刻失败关闭；无需触碰 Production。清理现有样本或第三方 voice ID 必须走已批准的数据删除流程，不能通过发布脚本删除。

## 本地验证

```text
npm run test:qwen-voice-clone-beta
npm run test:staging-runtime
npm run typecheck
npm run build
```

本文件不将本地测试或制品构建描述为真实 DashScope 或 Staging provider 证据；该证据只能由使用 Staging-only key 的受控测试产生。
