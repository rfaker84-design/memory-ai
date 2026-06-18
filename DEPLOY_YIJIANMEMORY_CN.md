# 忆见 MemoryAI — yijianmemory.cn 部署说明

## 前置要求

- Node.js 20+
- npm 10+
- Nginx
- 域名 yijianmemory.cn 已解析到服务器 IP

## 1. 克隆项目

```bash
git clone <repo-url> /opt/yijian-memory
cd /opt/yijian-memory
```

## 2. 安装依赖

```bash
npm install
```

## 3. 配置环境变量

复制并编辑生产环境配置：

```bash
cp .env.example .env.production
```

确保 `.env.production` 中以下变量正确：

| 变量 | 值 | 说明 |
|------|-----|------|
| `NEXT_PUBLIC_SITE_URL` | `https://yijianmemory.cn` | 站点公开 URL |
| `NEXT_PUBLIC_APP_URL` | `https://yijianmemory.cn` | 应用 URL（API 回调用） |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase 项目 URL | 数据库地址 |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon key | 公开密钥 |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role key | 服务端密钥 |
| `DEEPSEEK_API_KEY` | DeepSeek API Key | AI 模型 |
| `TENCENT_SECRET_ID` | 腾讯云 SecretId | 对象存储 |
| `TENCENT_SECRET_KEY` | 腾讯云 SecretKey | 对象存储 |

## 4. 构建项目

```bash
npm run build
```

输出在 `.next/standalone/` 目录。

## 5. 启动服务

### 方式一：直接启动（测试用）

```bash
npm start
```

### 方式二：PM2（推荐生产环境）

```bash
npm install -g pm2
pm2 start npm --name "yijian-memory" -- start
pm2 save
pm2 startup
```

## 6. 配置 Nginx

```bash
# 复制配置文件
sudo cp nginx/yijianmemory.cn.conf /etc/nginx/sites-available/yijianmemory.cn
sudo ln -s /etc/nginx/sites-available/yijianmemory.cn /etc/nginx/sites-enabled/

# 测试配置
sudo nginx -t

# 重载 Nginx
sudo nginx -s reload
```

## 7. HTTPS 证书配置

使用 Let's Encrypt 免费证书：

```bash
# 安装 certbot
sudo apt install certbot python3-certbot-nginx

# 获取证书
sudo certbot --nginx -d yijianmemory.cn -d www.yijianmemory.cn

# 自动续期
sudo certbot renew --dry-run
```

获取证书后，取消 `nginx/yijianmemory.cn.conf` 中 HTTPS server 块的注释，并重载 Nginx。

## 8. 域名解析

在域名注册商控制台添加 DNS 解析：

| 类型 | 主机记录 | 记录值 |
|------|----------|--------|
| A | @ | 服务器 IP |
| A | www | 服务器 IP |

## 9. 验证部署

```bash
# 本地检查
curl -I http://127.0.0.1:3000

# 公网检查
curl -I https://yijianmemory.cn
```

## 10. 更新部署

```bash
cd /opt/yijian-memory
git pull
npm install
npm run build
pm2 restart yijian-memory
```

## 11. ICP 备案

备案号在以下位置展示：
- 全站 Footer 组件 (`components/Footer.tsx`)
- 主世界页面底部 (`components/world/WorldShell.tsx`)

备案号获得后，搜索替换 `ICP备案号待填写` 为实际备案号。
