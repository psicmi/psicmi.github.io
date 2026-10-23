import type { APIRoute } from 'astro';
import { SITE, SITE_DESCRIPTION, SITE_NAME } from '../consts';
import { getPosts, postPath } from '../lib/content';

const escapeXml = (value: string) =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');

const rfc822 = (value: string) => new Date(`${value}+08:00`).toUTCString();

export const GET: APIRoute = async () => {
  const posts = (await getPosts()).slice(0, 30);
  const items = posts
    .map((post) => {
      const link = `${SITE}${postPath(post)}`;
      return [
        '    <item>',
        `      <title>${escapeXml(post.data.title)}</title>`,
        `      <link>${escapeXml(link)}</link>`,
        `      <guid isPermaLink="true">${escapeXml(link)}</guid>`,
        `      <pubDate>${rfc822(post.data.date)}</pubDate>`,
        `      <description>${escapeXml(post.data.summary)}</description>`,
        '    </item>',
      ].join('\n');
    })
    .join('\n');

  const xml = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">',
    '  <channel>',
    `    <title>${escapeXml(SITE_NAME)}</title>`,
    `    <link>${SITE}/</link>`,
    `    <description>${escapeXml(SITE_DESCRIPTION)}</description>`,
    '    <language>zh-CN</language>',
    `    <atom:link href="${SITE}/feed.xml" rel="self" type="application/rss+xml" />`,
    items,
    '  </channel>',
    '</rss>',
  ].join('\n');

  return new Response(xml, {
    headers: { 'Content-Type': 'application/rss+xml; charset=utf-8' },
  });
};
