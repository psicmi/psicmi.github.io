# psicmi.cc

PSICMI 的静态站点，由 Astro 构建，视觉与排版参照微信公众号：677px 阅读栏、17px/1.75 正文、订阅号式消息列表与合集。

## 环境

- Node.js 22+（本机使用 v24）
- Astro 7
- 发布目标：
  - 主站 `https://psicmi.cc`：阿里云云虚拟主机（Apache + PHP，仅托管构建产物）
  - 镜像 `https://psicmi.github.io`：GitHub Pages（隐藏文章不输出）

服务器上不需要安装 Node，所有构建都在本地完成。

## 常用命令

```bash
npm install          # 安装依赖

npm run dev          # 本地开发预览，默认 http://localhost:4321
npm run build        # 主站构建，产物在 dist/
npm run build:mirror # 镜像构建（SITE_URL=https://psicmi.github.io，MIRROR=1），产物同样在 dist/
npm run preview      # 预览构建产物
npm run check        # Astro 类型检查
```

构建时会关闭 Astro 遥测（`ASTRO_TELEMETRY_DISABLED=1`），避免在受限环境写入用户目录失败。

### 两套构建的差别

| | `npm run build` | `npm run build:mirror` |
|---|---|---|
| 站点地址 | `https://psicmi.cc` | `https://psicmi.github.io` |
| canonical | 指向主站 | 指向主站 |
| robots | 正常索引 | `noindex, nofollow` |
| 隐藏文章 | 输出到 `_protected/`，由 PHP 门禁保护 | 不生成页面，访问 404 |
| `gate.php` / `_gate/` | 包含 | 不包含 |

## 目录结构

```
src/
  components/       页头、页脚、消息卡片等组件
  layouts/          BaseLayout
  pages/            路由（.html 旧路径由 build.format: 'file' 保证）
  content/posts/    文章 Markdown
  content/pages/    独立页面 Markdown
  styles/           global.css（设计 tokens 与 .prose 正文排版）
  data/             合集定义
public/
  usr/uploads/      历史附件（保持旧路径）
  avatar.svg        本地头像
scripts/            迁移、构建后处理、部署脚本
```

## 写一篇文章

在 `src/content/posts/` 新建 Markdown 文件：

```md
---
title: 文章标题
date: 2026-10-23 10:00
collections: [1024]
tags: [linux, docker]
summary: 列表页摘要，留空则取正文首段
hidden: false
---

正文……
```

隐藏文章：

```yaml
hidden: true
password: 你的密码
```

`hidden: true` 的文章不会出现在首页、归档、合集、标签、RSS 与 sitemap 中；主站构建后由 `gate.php` 做密码校验，镜像构建直接跳过。

## 发布

### 主站（阿里云虚拟主机）

1. `npm run build`
2. 将 `dist/` 内容上传到网站根目录（后续提供 `scripts/deploy.mjs`，凭据只从环境变量读取）
3. 确认 `.htaccess`、`gate.php`、`_gate/`、`_protected/` 一并上传

### 镜像（GitHub Pages）

推送 `main` 后由 GitHub Actions 自动执行 `npm run build:mirror` 并发布；隐藏文章不会进入镜像。

## 安全约定

- `.env`、`.envrc`、`.gh-config/`、`.gh-credential-helper`、`.gitconfig` 已在 `.gitignore` 中排除，绝不提交
- 隐藏文章密码保存在本地 `.env` 与构建产物 `_gate/config.php`，不要写进 Markdown 的公开字段或 README
