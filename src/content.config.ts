import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { z } from 'astro/zod';

const posts = defineCollection({
  loader: glob({ pattern: '*.md', base: './src/content/posts' }),
  schema: z.object({
    title: z.string(),
    date: z.string(),
    updated: z.string().optional(),
    slug: z.string(),
    legacyId: z.number(),
    collections: z.array(z.string()).default([]),
    tags: z.array(z.string()).default([]),
    summary: z.string().default(''),
    hidden: z.boolean().default(false),
  }),
});

const pages = defineCollection({
  loader: glob({ pattern: '*.md', base: './src/content/pages' }),
  schema: z.object({
    title: z.string(),
    date: z.string(),
    updated: z.string().optional(),
    slug: z.string(),
    legacyId: z.number(),
    summary: z.string().default(''),
    hidden: z.boolean().default(false),
  }),
});

export const collections = { posts, pages };
