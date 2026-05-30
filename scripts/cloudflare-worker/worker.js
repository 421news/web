// 421.news SEO Worker
// 1. Sirve /robots.txt custom (Ghost no permite override via theme)
// 2. Agrega X-Robots-Tag: noindex a assets versionados ruidosos

const ROBOTS_TXT = `User-agent: *
Allow: /

# Block versioned asset noise that pollutes GSC "Crawled, not indexed"
Disallow: /assets/data/
Disallow: /assets/js/window-manager.js
Disallow: /assets/css/window-manager.css

# Ghost system paths
Disallow: /ghost/
Disallow: /p/
Disallow: /email/
Disallow: /r/

Sitemap: https://www.421.news/sitemap.xml
Sitemap: https://www.421.news/assets/data/hreflang-sitemap.xml
`;

const NOINDEX_PATTERNS = [
  /^\/assets\/js\/window-manager\.js/,
  /^\/assets\/css\/window-manager\.css/,
  /^\/assets\/data\//,
];

export default {
  async fetch(request) {
    const url = new URL(request.url);

    if (url.pathname === '/robots.txt') {
      return new Response(ROBOTS_TXT, {
        headers: {
          'content-type': 'text/plain; charset=utf-8',
          'cache-control': 'public, max-age=3600',
          'x-robots-source': '421-worker',
        },
      });
    }

    const response = await fetch(request);
    const needsNoindex = NOINDEX_PATTERNS.some(rx => rx.test(url.pathname));
    if (needsNoindex) {
      const headers = new Headers(response.headers);
      headers.set('x-robots-tag', 'noindex');
      return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers,
      });
    }

    return response;
  },
};
