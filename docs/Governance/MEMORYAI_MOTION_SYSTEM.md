# MemoryAI（忆见）Motion 系统规范

文档状态：ACTIVE

规范级别：MOTION BASELINE

---

## 1. Motion 定义

Motion 是 MemoryAI 产品体验的一部分。

Motion 用于表达：

- 空间连续性
- 存在感
- 情绪
- 状态变化
- 用户行为反馈

Motion 不是装饰。

禁止为了“看起来高级”增加动画。

---

## 2. Motion 原则

所有动画必须满足至少一个目标：

- 解释状态变化
- 保持页面连续性
- 回应用户输入
- 建立空间深度
- 强化情绪

如果动画不满足任何目标：

删除动画。

---

## 3. 禁止动画

默认禁止：

- 随机 Bounce
- 大幅 Elastic
- 按钮连续漂浮
- 无意义呼吸
- 全页面元素同时 Fade In
- 统一 Scroll Reveal 模板
- 大量旋转
- 快速闪光
- 高频粒子爆发
- Gaming UI 动画
- Cyberpunk 动画

---

## 4. 性能目标

核心交互目标：60 FPS

优先动画属性：

- `transform`
- `opacity`
- WebGL uniform

避免高频动画：

- `width`
- `height`
- `top`
- `left`
- 大面积 `filter: blur`
- 大面积 `backdrop-filter`

必须避免 Layout Thrashing。

---

## 5. Motion Runtime 原则

当页面存在复杂连续交互时：

禁止每个组件建立完全独立的 Motion 状态。

复杂页面应优先共享：

- Time
- Delta
- Scroll Progress
- Scroll Velocity
- Pointer Position
- Touch State
- Viewport State
- Visibility State

如果项目建立统一 Motion Runtime：

页面组件必须优先接入 Runtime。

禁止建立第二套平行 Motion Engine。

---

## 6. Scroll Motion

滚动不是动画触发按钮。

滚动应被视为连续输入信号。

允许使用：

- progress
- velocity
- direction
- distance from viewport center
- element depth

驱动视觉状态。

禁止所有元素使用相同 reveal 参数。

不同视觉层级可以具有不同 motion depth。

---

## 7. 默认 Reveal 基线

仅当任务没有独立 Motion Spec 时允许使用默认基线。

Initial：

- `opacity: 0`
- `translateY: 24px`
- `scale: 0.985`

Target：

- `opacity: 1`
- `translateY: 0`
- `scale: 1`

Duration：`0.72s`

Ease：`cubic-bezier(0.16, 1, 0.3, 1)`

Stagger：`40ms - 70ms`

禁止超过 `120ms` 的普通列表 stagger。

---

## 8. 页面转场基线

仅当任务没有独立页面转场规范时使用。

Exit：

- `opacity: 1 -> 0`
- `scale: 1 -> 0.992`
- `duration: 220ms`

Enter：

- `opacity: 0 -> 1`
- `scale: 0.992 -> 1`
- `duration: 520ms`

Ease：`cubic-bezier(0.16, 1, 0.3, 1)`

页面转场必须避免长时间阻塞用户。

---

## 9. Touch Feedback

所有主要触摸目标必须有反馈。

默认 Press：

- `scale: 1 -> 0.97`
- `duration: 90ms`

Release：

- `scale: 0.97 -> 1`
- `duration: 240ms`

Ease：`cubic-bezier(0.16, 1, 0.3, 1)`

禁止使用夸张弹跳恢复。

---

## 10. Velocity Motion

Velocity 驱动效果必须设置 Clamp。

禁止直接使用无限滚动速度控制视觉参数。

视觉变化必须具有：

- damping
- clamp
- return to idle

建议原则：

- 输入变化快。
- 视觉响应连续。
- 停止输入后平滑归零。

禁止突然归零。

---

## 11. 3D 与 WebGL

以下能力只在视觉价值明确时使用：

- Three.js
- React Three Fiber
- Shader

禁止为了技术展示增加 3D。

WebGL 场景必须考虑：

- 移动 GPU
- DPR
- 纹理大小
- Draw Call
- Shader Complexity
- 页面不可见状态
- 低性能设备

禁止默认无限制 DPR。

禁止后台持续高负载渲染。

---

## 12. Reduce Motion

必须尊重：

- `prefers-reduced-motion`

Reduce Motion 状态下：

- 关闭复杂视差。
- 关闭高强度 Camera Motion。
- 减少 Scroll Velocity Effect。
- 减少大范围 Scale。
- 保留必要状态反馈。

不得因为 Reduce Motion 导致功能不可用。

---

## 13. Motion 技术选择

允许根据任务使用：

- CSS Transform
- Web Animations API
- GSAP
- ScrollTrigger
- Lenis
- Three.js
- React Three Fiber
- Shader

技术选择必须根据交互需求决定。

禁止为了统一技术栈强制所有动画使用 GSAP。

禁止为了简单动画引入 WebGL。

---

## 14. Motion 验收

每个 Motion 任务必须检查：

- 是否连续
- 是否有输入反馈
- 是否存在突然跳变
- 是否掉帧
- 是否影响点击
- 是否影响滚动
- 是否影响软键盘
- 是否影响页面返回
- 是否尊重 Reduce Motion

不得只以 Desktop Chrome 作为验收环境。
