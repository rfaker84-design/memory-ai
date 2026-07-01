# M01 User Module

## 1. Purpose
用户系统负责登录、注册、用户资料、基础设置，是 MemoryAI V1 的身份基础。

## 2. Responsibilities
- 用户登录
- 用户注册
- 用户资料
- 用户设置
- Session 状态

## 3. Out of Scope
- AI 聊天
- 记忆体创建
- 支付会员
- 数字人
- 语音

## 4. Pages
- /login
- /profile
- /settings

## 5. Data Model Draft
- User
- Profile

## 6. API Draft
- /api/auth/login
- /api/auth/logout
- /api/user/profile
- /api/user/settings

## 7. Implementation Rules
- 页面不得直接访问数据库
- UI 只调用 feature 层
- feature 层调用 service 层
- service 层负责 Supabase/Auth
- build 必须通过

## 8. Next Tasks
- 审计现有登录页
- 设计正式 User/Profile 数据结构
- 实现登录状态守卫
- 实现 Profile 页面
