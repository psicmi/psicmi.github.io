import { getCollection, type CollectionEntry } from 'astro:content';
import collectionsData from '../data/collections.json';

export type Post = CollectionEntry<'posts'>;
export type PageEntry = CollectionEntry<'pages'>;

export interface CollectionMeta {
  slug: string;
  title: string;
  description: string;
  order: number;
}

export const PAGE_SIZE = 10;

export const COLLECTIONS = (collectionsData as CollectionMeta[]).slice().sort((a, b) => a.order - b.order);

/** 公开文章：排除隐藏文章，按发布时间倒序 */
export async function getPosts(): Promise<Post[]> {
  const posts = await getCollection('posts', ({ data }) => !data.hidden);
  return posts.sort((a, b) => b.data.date.localeCompare(a.data.date));
}

export function postPath(post: Post): string {
  return `/archives/${post.data.legacyId}.html`;
}

export function collectionPath(slug: string): string {
  return `/collection/${slug}.html`;
}

export function tagPath(slug: string): string {
  return `/tag/${slug}.html`;
}

export function dateParts(value: string) {
  const date = value.slice(0, 10);
  const [year, month, day] = date.split('-');
  return {
    date,
    year,
    monthDay: `${month}-${day}`,
    month,
    cn: `${year}年${Number(month)}月${Number(day)}日`,
    compact: `${year}-${month}-${day}`,
  };
}

export function getCollectionMeta(slug: string): CollectionMeta | undefined {
  return COLLECTIONS.find((item) => item.slug === slug);
}

export function postCollections(post: Post): CollectionMeta[] {
  return post.data.collections
    .map((slug) => getCollectionMeta(slug))
    .filter((item): item is CollectionMeta => Boolean(item));
}

export async function collectionsWithCount() {
  const posts = await getPosts();
  return COLLECTIONS.map((meta) => {
    const items = posts.filter((post) => post.data.collections.includes(meta.slug));
    return { ...meta, count: items.length, latest: items[0] };
  });
}

export async function allTags() {
  const posts = await getPosts();
  const map = new Map<string, { slug: string; count: number }>();
  for (const post of posts) {
    for (const tag of post.data.tags) {
      const current = map.get(tag) ?? { slug: tag, count: 0 };
      current.count += 1;
      map.set(tag, current);
    }
  }
  return [...map.values()].sort((a, b) => b.count - a.count || a.slug.localeCompare(b.slug));
}

/** 摘要里可能残留 Markdown 引用语法，渲染前再兜底清理一次 */
export function cleanSummary(value: string, limit = 100): string {
  const text = value
    .replace(/\[([^\]]*)\]\[[^\]]*\]/g, '$1')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/[*_`~]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  return text.length > limit ? `${text.slice(0, limit)}…` : text;
}
