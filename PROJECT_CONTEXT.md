# 忆见（MemoryAI）项目交接文档

## 项目目标

中国大陆市场。

核心产品：

通过照片、声音、人生故事、记忆碎片生成高度拟真的逝者数字人格。

最终形态：

用户上传资料
↓
生成数字人格
↓
克隆声音
↓
生成数字人形象
↓
实时语音聊天
↓
情感陪伴

不是纪念馆产品。

不是墓碑产品。

不是传统AI聊天机器人。

目标是：

数字人格陪伴。

---

## 当前技术栈

Frontend:

* Next.js 15 App Router
* TypeScript
* TailwindCSS

Backend:

* Next.js API Routes

Database:

* Supabase PostgreSQL

Storage:

* 腾讯云 COS

AI:

* DeepSeek API

Deployment:

* 腾讯云 Ubuntu
* PM2
* Nginx

Domain:

* yijianmemory.cn

---

## 已完成功能

### 用户系统

手机号登录

localStorage:
yijian_phone

---

### 记忆体

memories 表

支持：

* 姓名
* 关系
* 人生故事
* 照片
* 声音样本

---

### COS上传

照片上传：

/api/upload

声音上传：

/api/upload-voice

---

### AI聊天

/api/memory-chat

已接入 DeepSeek

支持：

* 人格档案
* 时间线
* 记忆碎片
* 长期记忆

---

### 长期记忆

personality_memories

AI会提取长期记忆

---

### 数字人训练中心

/avatar-center

支持：

开始声音训练

开始生成数字人

---

### 任务系统

avatar_jobs

字段：

* id
* memory_id
* job_type
* provider
* provider_job_id
* status
* input_url
* output_url
* provider_response
* error_message
* completed_at

---

### 数字人适配层

/api/avatar-provider

当前：

adapter_v1

模拟厂商接口

后续需要替换为：

* MiniMax Avatar
* 腾讯智影
* D-ID

---

## 已知问题

不要重复修改：

app/chat/page.tsx

历史上出现过：

../../../src/lib/supabase

路径错误。

正确：

../../src/lib/supabase

---

不要重复修改：

memory-chat

双回复问题已经修复。

---

不要再重新设计产品方向。

项目方向已经确定：

数字人格
↓
声音克隆
↓
数字人

不要回到纪念馆路线。

---

## 下一阶段目标

优先级1

真实声音克隆

优先：

CosyVoice
GPT-SoVITS

---

优先级2

真实数字人

优先：

MiniMax Avatar

备选：

腾讯智影

---

优先级3

实时语音对话

STT
↓
人格引擎
↓
TTS
↓
数字人说话

---

项目负责人要求：

尽量提供完整覆盖版代码。

不要大量增量修改。

不要频繁让用户定位第几行代码。
