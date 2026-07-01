# Media Schema Design

## Decision

统一使用 media_assets 表管理所有图片、音频、视频、头像、文档素材。

## media_assets Fields

- id
- user_id
- memory_id
- media_type
- url
- thumbnail_url
- mime_type
- size
- status
- metadata
- created_at
- updated_at

## Rules

- 所有媒体必须属于一个 memory
- 所有媒体必须有 user_id
- media_type 固定为 image/audio/video/avatar/document
- status 固定为 pending/uploaded/failed/deleted
- 文件存储路径由 StorageProvider 生成
- 业务模块不得直接操作 COS
