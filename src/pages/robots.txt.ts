import type { APIRoute } from 'astro';
import { SITE } from '../consts';
import { IS_MIRROR } from '../consts';

export const GET: APIRoute = () => {
  const body = IS_MIRROR
    ? ['User-agent: *', 'Disallow: /', ''].join('\n')
    : [
        'User-agent: *',
        'Allow: /',
        '',
        `Sitemap: ${SITE}/sitemap.xml`,
        '',
      ].join('\n');

  return new Response(body, {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });
};
