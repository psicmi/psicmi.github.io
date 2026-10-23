#!/usr/bin/env node
/**
 * 把 Typecho 的 mysqldump 转成 Astro 内容集合。
 *
 * 用法：
 *   node scripts/import-typecho.mjs typecho.sql [--out src] [--timezone Asia/Shanghai]
 *
 * 输出：
 *   src/content/posts/<cid>-<slug>.md
 *   src/content/pages/<slug>.md
 *   src/data/collections.json     合集（来自 Typecho 分类）
 *   .protected.json               隐藏文章密码（已在 .gitignore 中排除）
 */

import { mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { dirname, join } from 'node:path';

const args = process.argv.slice(2);
const dumpPath = args.find((a) => !a.startsWith('--'));
const getArg = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};

if (!dumpPath) {
  console.error('用法: node scripts/import-typecho.mjs <typecho.sql> [--out src]');
  process.exit(1);
}

const OUT_DIR = getArg('out', 'src');
const TIMEZONE = getArg('timezone', 'Asia/Shanghai');

/** Typecho 默认表结构，作为没有 CREATE TABLE 时的兜底 */
const DEFAULT_COLUMNS = {
  typecho_contents: [
    'cid', 'title', 'slug', 'created', 'modified', 'text', 'order', 'authorId',
    'template', 'type', 'status', 'password', 'commentsNum', 'allowComment',
    'allowPing', 'allowFeed', 'parent',
  ],
  typecho_metas: ['mid', 'name', 'slug', 'type', 'description', 'count', 'order', 'parent'],
  typecho_relationships: ['cid', 'mid'],
  typecho_options: ['name', 'user', 'value'],
};

const sql = await readFile(dumpPath, 'utf8');

/* ------------------------------------------------------------
   1. 解析 mysqldump
   ------------------------------------------------------------ */

function parseCreateColumns(source, table) {
  const re = new RegExp('CREATE TABLE `?' + table + '`?\\s*\\(', 'i');
  const match = re.exec(source);
  if (!match) return null;

  let i = match.index + match[0].length;
  let depth = 1;
  const body = [];
  for (; i < source.length && depth > 0; i++) {
    const ch = source[i];
    if (ch === '(') depth++;
    else if (ch === ')') depth--;
    if (depth > 0) body.push(ch);
  }
  const text = body.join('');
  const columns = [...text.matchAll(/^\s*`([^`]+)`\s+/gm)].map((m) => m[1]);
  return columns.length ? columns : null;
}

function parseString(source, start) {
  // start 指向开头的单引号
  let i = start + 1;
  let out = '';
  while (i < source.length) {
    const ch = source[i];
    if (ch === '\\') {
      const next = source[i + 1];
      const map = {
        '0': '\0', b: '\b', n: '\n', r: '\r', t: '\t', Z: '\x1a',
        '\\': '\\', "'": "'", '"': '"',
      };
      out += map[next] ?? next;
      i += 2;
      continue;
    }
    if (ch === "'") {
      if (source[i + 1] === "'") {
        out += "'";
        i += 2;
        continue;
      }
      return { value: out, next: i + 1 };
    }
    out += ch;
    i++;
  }
  throw new Error('未闭合的字符串字面量');
}

function parseTuples(source, start) {
  const rows = [];
  let i = start;

  const skipSpace = () => {
    while (i < source.length && /\s/.test(source[i])) i++;
  };

  for (;;) {
    skipSpace();
    if (i >= source.length) {
      return { rows, end: i };
    }
    if (source[i] === ';') {
      return { rows, end: i };
    }
    if (source[i] === ',') { i++; continue; }
    if (source[i] !== '(') {
      // 跳过不认识的内容，避免卡死
      i++;
      continue;
    }

    i++;
    const row = [];
    for (;;) {
      skipSpace();
      const ch = source[i];

      if (ch === ')') { i++; break; }
      if (ch === ',') { i++; continue; }

      if (ch === "'") {
        const parsed = parseString(source, i);
        row.push(parsed.value);
        i = parsed.next;
        continue;
      }

      if (/^null/i.test(source.slice(i, i + 4))) {
        row.push(null);
        i += 4;
        continue;
      }

      // 数字或未加引号的标识符
      const numMatch = /^-?\d+(?:\.\d+)?/.exec(source.slice(i));
      if (numMatch) {
        row.push(numMatch[0]);
        i += numMatch[0].length;
        continue;
      }

      // 其他 token
      let j = i;
      while (j < source.length && !/[),]/.test(source[j])) j++;
      row.push(source.slice(i, j).trim());
      i = j;
    }
    rows.push(row);
  }

  return rows;
}

function parseDump(source) {
  const tables = {};

  for (const table of Object.keys(DEFAULT_COLUMNS)) {
    const columns = parseCreateColumns(source, table) ?? DEFAULT_COLUMNS[table];
    const rows = [];

    const re = new RegExp('INSERT INTO `?' + table + '`?\\s*(\\([^)]*\\))?\\s*VALUES\\s*', 'gi');
    let match;
    while ((match = re.exec(source))) {
      let insertColumns = columns;
      if (match[1]) {
        insertColumns = [...match[1].matchAll(/`([^`]+)`/g)].map((m) => m[1]);
      }
      const { rows: tuples, end } = parseTuples(source, re.lastIndex);
      for (const tuple of tuples) {
        const row = {};
        insertColumns.forEach((col, idx) => {
          row[col] = tuple[idx] ?? null;
        });
        rows.push(row);
      }
      // 从语句的真实结束位置继续扫描，避免正文里的分号截断
      re.lastIndex = Math.max(end + 1, re.lastIndex);
    }

    tables[table] = rows;
  }

  return tables;
}

const db = parseDump(sql);

/* ------------------------------------------------------------
   2. 数据整理
   ------------------------------------------------------------ */

const contents = db.typecho_contents ?? [];
const metas = db.typecho_metas ?? [];
const relationships = db.typecho_relationships ?? [];

const metaById = new Map(metas.map((m) => [String(m.mid), m]));
const categories = metas.filter((m) => m.type === 'category');
const tags = metas.filter((m) => m.type === 'tag');

const relationsByCid = new Map();
for (const rel of relationships) {
  const cid = String(rel.cid);
  if (!relationsByCid.has(cid)) relationsByCid.set(cid, []);
  relationsByCid.get(cid).push(String(rel.mid));
}

function formatDate(unixSeconds) {
  const ts = Number(unixSeconds);
  if (!Number.isFinite(ts) || ts <= 0) return null;
  const date = new Date(ts * 1000);
  const parts = new Intl.DateTimeFormat('sv-SE', {
    timeZone: TIMEZONE,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hour12: false,
  }).format(date);
  return parts.replace(' ', 'T');
}

function normalizeText(text) {
  return String(text ?? '')
    .replace(/^\s*<!--markdown-->\s*/i, '')
    .replace(/https?:\/\/(?:www\.)?psicmi\.cc\/index\.php\//gi, '/')
    .replace(/https?:\/\/(?:www\.)?psicmi\.cc\//gi, '/')
    .replace(/https?:\/\/(?:www\.)?psicmi\.win\//gi, '/')
    .replace(/https?:\/\/static\.psicmi\.cc\/usr\/uploads\//gi, '/usr/uploads/')
    .replace(/\r\n/g, '\n')
    .trim();
}

function stripMarkdown(input) {
  return input
    .replace(/<!--more-->/g, '')
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/^\s*\[[^\]]+\]:\s*\S+.*$/gm, ' ')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]*)\]\[[^\]]*\]/g, '$1')
    .replace(/<[^>]+>/g, ' ')
    .replace(/[#>*_`~-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function splitSummary(text) {
  const marker = '<!--more-->';
  if (text.includes(marker)) {
    return stripMarkdown(text.split(marker)[0]).slice(0, 120);
  }
  return stripMarkdown(text).slice(0, 120);
}

/** Typecho 常见写法 `##标题##`（# 后没有空格）在 CommonMark 里不是标题，这里补空格 */
function normalizeHeadings(input) {
  let inFence = false;

  return input
    .split('\n')
    .map((line) => {
      if (/^\s*(```|~~~)/.test(line)) {
        inFence = !inFence;
        return line;
      }
      if (inFence) return line;
      if (/^(?: {4}|\t)/.test(line)) return line;

      const match = /^(#{1,6})([^\s#!].*)$/.exec(line);
      if (!match) return line;

      const level = match[1];
      const content = match[2].replace(/\s*#+\s*$/, '').trim();
      return content ? `${level} ${content}` : line;
    })
    .join('\n');
}

/** 图片不迁移：移除正文里的图片与指向图片文件的链接 */
function stripImages(input) {
  let text = input;

  // 先找出引用定义里指向图片文件的 id
  const imageRefs = new Set();
  for (const m of text.matchAll(/^\s*\[([^\]]+)\]:\s*(\S+)/gm)) {
    if (/\.(?:png|jpe?g|gif|webp|svg|bmp)(?:[?#]\S*)?$/i.test(m[2])) {
      imageRefs.add(m[1]);
    }
  }

  // 图片被包在链接里：[![alt][ref]](url) / [![alt](url)](url)
  text = text.replace(/\[\s*!\[[^\]]*\]\[[^\]]*\]\s*\]\([^)]*\)/g, '');
  text = text.replace(/\[\s*!\[[^\]]*\]\([^)]*\)\s*\]\([^)]*\)/g, '');

  // 指向图片定义的引用式链接（含普通链接写法）
  for (const id of imageRefs) {
    const escaped = id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    text = text.replace(new RegExp(`!?\\[[^\\]]*\\]\\[${escaped}\\]`, 'g'), '');
  }

  // 行内图片与指向图片文件的行内链接
  text = text.replace(/!\[[^\]]*\]\([^)]*\)/g, '');
  text = text.replace(/\[[^\]]*\]\([^)]*\.(?:png|jpe?g|gif|webp|svg|bmp)(?:[?#][^)]*)?\)/gi, '');

  // 兜底：引用式/快捷图片
  text = text.replace(/!\[[^\]]*\]\[[^\]]*\]/g, '');
  text = text.replace(/!\[[^\]]*\]/g, '');

  // HTML 图片
  text = text.replace(/<figure\b[\s\S]*?<\/figure>/gi, '');
  text = text.replace(/<picture\b[\s\S]*?<\/picture>/gi, '');
  text = text.replace(/<img\b[^>]*?\/?>/gi, '');

  // 删掉图片引用的定义行
  text = text
    .split('\n')
    .filter((line) => {
      const m = /^\s*\[([^\]]+)\]:\s*(\S+)/.exec(line);
      return !(m && imageRefs.has(m[1]));
    })
    .join('\n');

  return text
    .replace(/[ \t]+$/gm, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function decodeEntities(value) {
  return String(value ?? '')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&#x27;/gi, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&');
}

/** 指向未发布文章的链接改为纯文本，避免站内死链 */
function dropUnpublishedLinks(input, published) {
  let text = input;
  const badRefs = new Set();

  for (const match of text.matchAll(/^\s*\[([^\]]+)\]:\s*(\S+)/gm)) {
    const target = /\/archives\/(\d+)\.html/.exec(match[2]);
    if (target && !published.has(target[1])) badRefs.add(match[1]);
  }

  if (badRefs.size === 0) return text;

  for (const ref of badRefs) {
    const escaped = ref.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    text = text.replace(new RegExp(`\\[([^\\]]*)\\]\\[${escaped}\\]`, 'g'), '$1');
  }

  return text
    .split('\n')
    .filter((line) => {
      const match = /^\s*\[([^\]]+)\]:\s*\S+/.exec(line);
      return !(match && badRefs.has(match[1]));
    })
    .join('\n');
}

function yamlString(value) {
  return JSON.stringify(String(value ?? ''));
}

function yamlArray(values) {
  return `[${values.map((v) => yamlString(v)).join(', ')}]`;
}

function buildFrontmatter(data) {
  const lines = ['---'];
  lines.push(`title: ${yamlString(data.title)}`);
  lines.push(`date: ${yamlString(data.date)}`);
  if (data.updated) lines.push(`updated: ${yamlString(data.updated)}`);
  lines.push(`slug: ${yamlString(data.slug)}`);
  lines.push(`legacyId: ${data.legacyId}`);
  if (data.collections.length) lines.push(`collections: ${yamlArray(data.collections)}`);
  if (data.tags.length) lines.push(`tags: ${yamlArray(data.tags)}`);
  lines.push(`summary: ${yamlString(data.summary)}`);
  if (data.cover) lines.push(`cover: ${yamlString(data.cover)}`);
  lines.push(`hidden: ${data.hidden ? 'true' : 'false'}`);
  lines.push('---', '');
  return lines.join('\n');
}

function safeSlug(value, fallback) {
  const slug = String(value ?? '').trim().replace(/^\/+|\/+$/g, '');
  return slug || fallback;
}

/* ------------------------------------------------------------
   3. 写出
   ------------------------------------------------------------ */

const postsDir = join(OUT_DIR, 'content', 'posts');
const pagesDir = join(OUT_DIR, 'content', 'pages');
const dataDir = join(OUT_DIR, 'data');

await rm(postsDir, { recursive: true, force: true });
await rm(pagesDir, { recursive: true, force: true });
await mkdir(postsDir, { recursive: true });
await mkdir(pagesDir, { recursive: true });
await mkdir(dataDir, { recursive: true });

const protectedEntries = [];
const skipped = [];
let postCount = 0;
let pageCount = 0;

// 实际会生成页面的文章 cid：publish，或 hidden 但带密码
const publishedCids = new Set(
  contents
    .filter((item) => {
      const status = String(item.status ?? '');
      const password = String(item.password ?? '').trim();
      return (
        item.type === 'post' &&
        ['publish', 'hidden'].includes(status) &&
        !(status === 'hidden' && !password)
      );
    })
    .map((item) => String(item.cid)),
);

const sorted = [...contents]
  .filter((c) => ['post', 'page'].includes(c.type))
  .sort((a, b) => Number(a.cid) - Number(b.cid));

for (const item of sorted) {
  const status = String(item.status ?? '');
  const password = String(item.password ?? '').trim();
  const isPost = item.type === 'post';
  // 只有文章需要进入密码门；独立页面照常公开
  const hidden = isPost && (status === 'hidden' || Boolean(password));

  if (!['publish', 'hidden'].includes(status)) {
    skipped.push({ cid: item.cid, title: item.title, status });
    continue;
  }

  // 隐藏但没有密码的文章无法通过密码门访问，直接不发布
  if (isPost && status === 'hidden' && !password) {
    skipped.push({ cid: item.cid, title: item.title, status, reason: 'hidden-without-password' });
    continue;
  }

  const cid = Number(item.cid);
  const slug = safeSlug(item.slug, `post-${cid}`);

  // 旧主题的模板页面由 Astro 重新生成，不作为内容页迁移
  if (!isPost && ['archive', 'categories', 'tags'].includes(slug)) {
    skipped.push({ cid, title: item.title, status, reason: 'template-page' });
    continue;
  }
  const text = dropUnpublishedLinks(
    normalizeHeadings(stripImages(normalizeText(item.text))),
    publishedCids,
  );
  const date = formatDate(item.created);
  const updated = formatDate(item.modified);

  const mids = relationsByCid.get(String(cid)) ?? [];
  const itemMetas = mids.map((mid) => metaById.get(mid)).filter(Boolean);
  const itemCategories = itemMetas.filter((m) => m.type === 'category').map((m) => safeSlug(m.slug, String(m.mid)));
  const itemTags = itemMetas.filter((m) => m.type === 'tag').map((m) => safeSlug(m.slug, String(m.mid)));

  const frontmatter = buildFrontmatter({
    title: decodeEntities(item.title) || '(无标题)',
    date,
    updated: updated && updated !== date ? updated : null,
    slug,
    legacyId: cid,
    collections: itemCategories,
    tags: itemTags,
    summary: decodeEntities(splitSummary(text)),
    hidden,
  });

  const body = text.replace(/<!--more-->/g, '').trim();
  const filename = item.type === 'page' ? `${slug}.md` : `${cid}-${slug}.md`;
  const target = item.type === 'page' ? join(pagesDir, filename) : join(postsDir, filename);
  await writeFile(target, `${frontmatter}${body}\n`);

  if (hidden) {
    protectedEntries.push({ cid, slug, title: item.title, password, status });
  }

  if (item.type === 'page') pageCount++;
  else postCount++;
}

const collections = categories.map((m) => ({
  slug: safeSlug(m.slug, String(m.mid)),
  title: m.name,
  description: m.description || '',
  order: Number(m.order) || 0,
}));

await writeFile(join(dataDir, 'collections.json'), `${JSON.stringify(collections, null, 2)}\n`);
await writeFile(join(OUT_DIR, '..', '.protected.json'), `${JSON.stringify(protectedEntries, null, 2)}\n`);

console.log(JSON.stringify({
  posts: postCount,
  pages: pageCount,
  collections: collections.length,
  tags: tags.length,
  hidden: protectedEntries.length,
  skipped,
  output: { postsDir, pagesDir, dataDir },
}, null, 2));
