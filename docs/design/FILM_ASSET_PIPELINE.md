# Film Asset Pipeline

忆见核心视觉不再由代码生成。

核心电影体验由外部视觉工具生成 MP4。

Next.js 只负责稳定播放、切换、衔接。

## 电影资产目录

固定目录：

```text
public/experience/films/
```

未来固定放置：

```text
waiting.mp4
response.mp4
presence.mp4
reunion.mp4
```

## 资产标准

- `waiting.mp4`：20s loop
- `response.mp4`：3s transition
- `presence.mp4`：20s loop
- `reunion.mp4`：8s transition

## 播放原则

- 页面不生成核心星空视觉。
- 页面不生成核心电影动效。
- 页面只播放已经完成的电影资产。
- 切换与衔接由 Next.js 控制。
- 视觉质量由外部电影资产生产流程保证。
