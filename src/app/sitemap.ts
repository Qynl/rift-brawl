import type { MetadataRoute } from 'next';

// `output: export` needs every route to declare itself static.
export const dynamic = 'force-static';

const SITE = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://qynl.github.io/rift-brawl';

/**
 * One page, but a sitemap still tells crawlers the canonical URL and when the
 * build changed — which matters for a link that is meant to be shared.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  return [
    {
      url: SITE,
      lastModified: new Date(),
      changeFrequency: 'weekly',
      priority: 1,
    },
  ];
}
