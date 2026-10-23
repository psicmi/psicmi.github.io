import type { APIRoute } from 'astro';
import { getCollection } from 'astro:content';
import { SITE } from '../consts';
import {
  PAGE_SIZE,
  allTags,
  collectionPath,
  collectionsWithCount,
  getPosts,
  postPath,
  tagPath,
} from '../lib/content';

const escapeXml = (value: string) =>
  value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

interface Entry {
  loc: string;
  lastmod?: string;
}

export const GET: APIRoute = async () => {
  const posts = await getPosts();
  const collections = (await collectionsWithCount()).filter((item) => item.count > 0);
  const tags = await allTags();
  const pages = await getCollection('pages');
  const totalPages = Math.ceil(posts.length / PAGE_SIZE);

  const entries: Entry[] = [
    { loc: '/' },
    ...Array.from({ length: Math.max(0, totalPages - 1) }, (_, index) => ({
      loc: `/page/${index + 2}.html`,
    })),
    { loc: '/archive.html' },
    { loc: '/collections.html' },
    ...collections.map((item) => ({ loc: collectionPath(item.slug) })),
    { loc: '/tags.html' },
    ...tags.map((tag) => ({ loc: tagPath(tag.slug) })),
    ...posts.map((post) => ({
      loc: postPath(post),
      lastmod: (post.data.updated ?? post.data.date).slice(0, 10),
    })),
    ...pages.map((page) => ({
      loc: `/${page.data.slug}.html`,
      lastmod: page.data.date.slice(0, 10),
    })),
  ];

  const urls = entries
    .map((entry) =>
      [
        '  <url>',
        `    <loc>${escapeXml(`${SITE}${entry.loc}`)}</loc>`,
        entry.lastmod ? `    <lastmod>${entry.lastmod}</lastmod>` : '',
        '  </url>',
      ]
        .filter(Boolean)
        .join('\n'),
    )
    .join('\n');

  const xml = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    urls,
    '</urlset>',
  ].join('\n');

  return new Response(xml, {
    headers: { 'Content-Type': 'application/xml; charset=utf-8' },
  });
};
