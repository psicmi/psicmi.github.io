#!/usr/bin/env node
/**
 * 构建后处理：把受保护文章移出公开路径，生成 PHP 门禁配置与 Apache 规则。
 *
 * 用法：node scripts/protect.mjs
 * 依赖：dist/ 已由 astro build 生成，.protected.json 由迁移脚本产出。
 */

import { access, mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { constants } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { join } from 'node:path';

const DIST = 'dist';
const PROTECTED_JSON = '.protected.json';
const SECRET_FILE = '.gate-secret';

async function exists(path) {
  try {
    await access(path, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

let entries = [];
try {
  entries = JSON.parse(await readFile(PROTECTED_JSON, 'utf8'));
} catch {
  console.log('[protect] 没有 .protected.json，跳过');
  process.exit(0);
}

if (!Array.isArray(entries) || entries.length === 0) {
  console.log('[protect] 没有受保护文章，跳过');
  process.exit(0);
}

let secret;
if (await exists(SECRET_FILE)) {
  secret = (await readFile(SECRET_FILE, 'utf8')).trim();
} else {
  secret = randomBytes(32).toString('hex');
  await writeFile(SECRET_FILE, `${secret}\n`);
}

await mkdir(join(DIST, '_protected'), { recursive: true });
await mkdir(join(DIST, '_gate'), { recursive: true });

const articles = {};
const moved = [];

for (const entry of entries) {
  const cid = String(entry.cid);
  const source = join(DIST, 'archives', `${cid}.html`);
  const target = join(DIST, '_protected', `${cid}.html`);

  if (!(await exists(source))) {
    console.warn(`[protect] 找不到 ${source}，跳过`);
    continue;
  }

  await rename(source, target);
  articles[cid] = {
    password: String(entry.password ?? ''),
    title: String(entry.title ?? ''),
  };
  moved.push(cid);
}

const phpValue = (value) => `'${String(value).replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;

const articleLines = Object.entries(articles)
  .map(
    ([cid, item]) =>
      `        ${phpValue(cid)} => ['password' => ${phpValue(item.password)}, 'title' => ${phpValue(item.title)}],`,
  )
  .join('\n');

const config = `<?php
// 由 scripts/protect.mjs 生成，请勿手改。
// 直接访问本文件不会输出任何内容。
if (!defined('PSICMI_GATE')) {
    http_response_code(404);
    exit;
}

return [
    'secret' => ${phpValue(secret)},
    'articles' => [
${articleLines}
    ],
];
`;

await writeFile(join(DIST, '_gate', 'config.php'), config);

const deny = `<IfModule mod_authz_core.c>
  Require all denied
</IfModule>
<IfModule !mod_authz_core.c>
  Order allow,deny
  Deny from all
</IfModule>
`;

await writeFile(join(DIST, '_protected', '.htaccess'), deny);
await writeFile(join(DIST, '_gate', '.htaccess'), deny);

const protectedRules = moved
  .map(
    (cid) =>
      `  # 受保护文章 /archives/${cid}.html -> 密码门\n  RewriteRule ^archives/${cid}\\.html$ /gate.php?id=${cid} [L,QSA]`,
  )
  .join('\n\n');

const htaccess = `# 由 scripts/protect.mjs 生成，请勿手改
Options -Indexes
DirectoryIndex index.html

<IfModule mod_rewrite.c>
  RewriteEngine On
  RewriteBase /

  # 只对正式域名强制 HTTPS，避免本地预览被跳转
  RewriteCond %{HTTPS} !=on
  RewriteCond %{HTTP_HOST} ^psicmi\\.cc$ [NC]
  RewriteRule ^ https://%{HTTP_HOST}%{REQUEST_URI} [L,R=301]

  # 旧分页 /page/2/ -> /page/2.html
  RewriteRule ^page/([0-9]+)/$ /page/$1.html [L,R=301]

  # 旧 RSS /feed/ -> /feed.xml
  RewriteRule ^feed/?$ /feed.xml [L]

${protectedRules}
</IfModule>

<IfModule mod_deflate.c>
  AddOutputFilterByType DEFLATE text/html text/css application/javascript application/json application/xml image/svg+xml
</IfModule>

<IfModule mod_expires.c>
  ExpiresActive On
  ExpiresByType text/css "access plus 1 year"
  ExpiresByType application/javascript "access plus 1 year"
  ExpiresByType image/svg+xml "access plus 30 days"
  ExpiresByType text/html "access plus 1 hour"
</IfModule>

ErrorDocument 404 /404.html
`;

await writeFile(join(DIST, '.htaccess'), htaccess);

console.log(
  JSON.stringify(
    {
      moved,
      gateConfig: join(DIST, '_gate', 'config.php'),
      htaccess: join(DIST, '.htaccess'),
    },
    null,
    2,
  ),
);
