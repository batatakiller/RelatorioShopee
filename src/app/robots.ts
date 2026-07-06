import type { MetadataRoute } from 'next';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: ['/', '/resgatar'],
        // Ferramentas internas (dashboard) ficam fora da busca.
        disallow: ['/leads', '/licenca', '/settings', '/calculadora', '/import'],
      },
    ],
    sitemap: 'https://resgatar.supersoftware.info/sitemap.xml',
  };
}
