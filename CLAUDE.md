# 421.news - Ghost Theme Project

## Overview
Ghost CMS theme for **421.news**, a bilingual (ES/EN) blog about culture, gaming, tech, and real life. The site runs on Ghost Pro at `421bn.ghost.io` (public URL: `www.421.news`). Spanish content lives at `/es/`, English at `/en/`, and root `/` is a minimal landing page with browser language redirect.

## Credentials

- **Ghost Admin API Key**: `680be497f896280001455172:50f2d88ff42197eb96adf838b5c4b4baccc3ff6ff2e7772390b16ca4bcc6d967`
- **Ghost Content API Key**: `420da6f85b5cc903b347de9e33`
- **Ghost instance**: `421bn.ghost.io` (redirects to `www.421.news`)
- **GitHub repo**: `https://github.com/421news/web.git` (branch: `main`)

## Deploy Workflow

1. Edit files
2. Bump version in `package.json`
3. Zip (excluding `.git/`, `node_modules/`, `.github/`, `scripts/`, `testeo/`, `backups/`, `mockup-*.html`)
4. Upload via Ghost Admin API (`POST /ghost/api/admin/themes/upload/`)
5. Activate via Admin API (`PUT /ghost/api/admin/themes/421-theme/activate/`)
6. Auth: JWT signed with HMAC-SHA256 using the Admin API key

**IMPORTANT**: `routes.yaml` and `redirects.yaml` CANNOT be uploaded via API token (returns 403). They require cookie-based staff auth. The user must upload them manually via Ghost Admin > Settings > Labs > Routes / Redirects.

Quick deploy (zip + upload + activate):
```bash
cd /home/realjuanruocco/Escritorio/claude/421-web
zip -r /tmp/421-theme.zip . -x ".git/*" "node_modules/*" ".github/*" "scripts/*" "testeo/*" "mockup-*.html" "backups/*" "*.zip"
node -e "
const jwt = require('jsonwebtoken');
const FormData = require('form-data');
const fs = require('fs');
const https = require('https');
const [id, secret] = '680be497f896280001455172:50f2d88ff42197eb96adf838b5c4b4baccc3ff6ff2e7772390b16ca4bcc6d967'.split(':');
const token = jwt.sign({}, Buffer.from(secret, 'hex'), { keyid: id, algorithm: 'HS256', expiresIn: '5m', audience: '/admin/' });
const form = new FormData();
form.append('file', fs.createReadStream('/tmp/421-theme.zip'));
const req = https.request({ hostname: '421bn.ghost.io', path: '/ghost/api/admin/themes/upload/', method: 'POST', headers: { ...form.getHeaders(), 'Authorization': 'Ghost ' + token } }, (res) => {
  let data = ''; res.on('data', (c) => data += c);
  res.on('end', () => { console.log('Upload:', res.statusCode);
    const req2 = https.request({ hostname: '421bn.ghost.io', path: '/ghost/api/admin/themes/421-theme/activate/', method: 'PUT', headers: { 'Authorization': 'Ghost ' + token, 'Content-Length': 0 } }, (res2) => { let d2 = ''; res2.on('data', (c) => d2 += c); res2.on('end', () => console.log('Activate:', res2.statusCode)); }); req2.end();
  });
}); form.pipe(req);
"
```

## File Structure

### Root templates (pages)
- `default.hbs` - Main layout. Loads Google Fonts (Nunito Sans + Lora) via CSS `display=swap`, global CSS, `render-card.js` (sync, in `<head>`), `light-mode.js`. Removes Ghost Portal signup CTA via querySelectorAll + setTimeout (no MutationObserver). Hreflang injection, browser language redirect to `/en/`. Inline script patches Ghost's Article JSON-LD publisher logo (guarded: only runs on pages with ld+json). Updates sticky subscribe button text/href for EN pages. `window-manager.css` and `window-manager.js` load conditionally (desktop only, `>=1024px`).
- `landing.hbs` - Minimal landing page at `/`. Displays centered 421 logo. Actual routing is done by `default.hbs` browser language redirect (EN browsers → `/en/`, others → `/es/`).
- `index.hbs` - Spanish homepage (`/es/`)
- `en.hbs` - English homepage (`/en/`)
- `post.hbs` - Post router: checks `#en` tag to pick `post-en.hbs` or `post-es.hbs`. Also loads translation link JS (reads `english-version`/`spanish-version` meta tags to build cross-language links with `/es/` and `/en/` prefixes).
- `page.hbs` - Static pages. Has `{{#page}}` context for title/feature_image
- **`rutas.hbs`** - Spanish reading routes page (`/es/rutas/`). Loads `rutas.js` which fetches posts from Content API and renders 7 curated thematic routes.
- **`routes.hbs`** - English reading routes page (`/en/routes/`). Same as `rutas.hbs` but EN.
- **`canon.hbs`** - Spanish Canon 421 page (`/es/canon/`). Loads `rutas.js` which fetches 25 essential posts with editorial reasons.
- **`canon-en.hbs`** - English Canon 421 page (`/en/canon/`).
- **`revista.hbs`** - Revista 421 magazine archive page (`/es/revista-421/`). Loads `revista.js` which renders issue cards from `revista.json`. Custom OG/Twitter meta tags.
- **`pitcheale.hbs`** - Community pitch/submission page (`/es/pitcheale-a-421/`). 3 category tabs (Escritura, Ilustracion, Videojuegos) with custom SVG icons (`icono_escritura.svg`, `icono_ilustracion.svg`, `icono_videojuegos.svg`) and embedded Google Form iframes.
- `suscribite.hbs` - Spanish subscription page (`/es/suscribite/`)
- `subscribe.hbs` - English subscription page (`/en/subscribe/`)
- `mi-suscripcion.hbs` - Spanish subscription management page (`/es/mi-suscripcion/`, noindex). Shows paid/free/guest states, links to MTG Collection app (https://mtg.421.news) for paid members. Sign out button (`DELETE /members/api/session`).
- `my-subscription.hbs` - English subscription management page (`/en/my-subscription/`, noindex). Same as ES version with EN text.
- `last-posts-es.hbs` - Spanish archive/all-posts page (`/es/ultimos-posts/`). Loads `filter-posts.js`.
- `last-posts-en.hbs` - English archive page (`/en/last-posts/`). Loads `filter-posts.js`.
- `gracias.hbs` - Thank you page (ES, `/gracias/`)
- `oh-yes.hbs` - Confirmation page (EN, `/oh-yes/`)
- `tag.hbs` - Tag listing page
- `tags.hbs` - All tags page
- `author.hbs` - Author page
- `error-404.hbs` - 404 page
- `tag-cultura.hbs`, `tag-tecnologia.hbs`, `tag-juegos.hbs`, `tag-vida-real.hbs`, `tag-el-canon.hbs`, `tag-wiki.hbs` - Spanish primary tag templates
- `tag-culture.hbs`, `tag-tech.hbs`, `tag-games.hbs`, `tag-real-life.hbs` - English primary tag templates
- `tag-secundario-*.hbs` - Secondary tag templates (argentina, cannabis, cripto, deportes, filosofia, historieta, internet, libros, magicthegathering, memes, musica, peliculas, series, soberania, tutoriales, videojuegos, warhammer)

### Partials (`partials/`)
- **`post-es.hbs`** - Spanish post template. Contains article body, author box, related posts query, file browser
- **`post-en.hbs`** - English post template. Same structure as post-es but with EN text and `hash-en` filters
- `post-card.hbs` - Post card component (used in grids). Texture overlay is lazy-loaded via IntersectionObserver in `render-card.js` (no inline `background-image`). Hover effect handled by event delegation in `render-card.js`.
- `post-header.hbs` / `featured-post-header.hbs` - Post header with feature image
- `site-nav-es.hbs` / `site-nav-en.hbs` - Navigation bars
- `site-footer.hbs` - Footer
- `file-browser.hbs` / `file-browser-en.hbs` - File browser navigation component. Sidebar has: Marcadores (Inicio, Cultura, Tecnologia, Juegos, Vida real) + Sistema (Rutas, Canon, Suscribite, Revista). Grid has folders + rutas.sh, canon.sh, suscribite.sh, revista.pdf, ultimos.log.
- `breadcrumb-tag.hbs` - Reusable BreadcrumbList JSON-LD partial for tag pages. Accepts `tagName` and optional `lang` parameters.
- `general-styling.hbs` - Inline style partial (CSS variables, etc.)
- `reading-progress-bar.hbs` - Reading progress bar component
- `index-featured-post.hbs` / `index-featured-post-mobile.hbs` - Featured post on homepage
- `index-highlighted-posts-es.hbs` / `index-highlighted-posts-en.hbs` - Highlighted posts grids
- `last-posts-es.hbs` / `last-posts-en.hbs` / `last-posts-es-tag.hbs` / `last-posts-en-tag.hbs` / `last-posts-es-secondary-tag.hbs` - Latest posts sections
- `tag-preview-section.hbs` - Tag preview sections
- `tag-page-featured-post.hbs` - Featured post for tag pages (accepts language filter parameter)
- `tag-page-highlighted-posts-es.hbs` / `tag-page-highlighted-posts-en.hbs` - Highlighted posts for tag pages
- `tag-cloud.hbs` - Tag cloud with post counts, links to tag pages
- `highlighted-post.hbs` - Large featured post card for tag pages (two-column layout with hover overlay)
- `wiki-section-es.hbs` / `wiki-section-en.hbs` - "Lo ultimo en la Wiki" sections (fetches 4 latest wiki-tagged posts)
- `tps_alt-es.hbs` / `tps_alt-en.hbs` - Alternate posts list for tag page sidebars (3 posts by tag slug)
- `subscribe-popup.hbs` - Modal subscription CTA. Appears at 20% scroll depth for non-members. 7-day cooldown via localStorage. Bilingual (checks `#en` tag).
- `sticky-subscribe-mobile-button.hbs` - Mobile-only full-width sticky subscribe button. Text/href updated by `default.hbs` for EN pages.
- `banner.hbs` - Wiki ad banner (placeholder/unused)
- `window-manager.hbs` - Desktop-style window manager UI component

### CSS (`assets/css/`)
- **`index.css`** - Main custom CSS. All theme overrides go here:
  - Gallery breakout (1200px max, center with transform)
  - Bookmark card thumbnail gap fix
  - Header card centering
  - HR gradient divider (uses `var(--gradient-main)`)
  - Link styling (gradient text, no double underline from `<u>` tags)
  - Caption link gradient
  - Rich text: Lora serif font, line-height 1.5, figcaption 15px
  - h2/h3: Nunito Sans, margin-top 4rem, margin-bottom 1.5rem
  - Blockquote gradient border
  - Page hero (no borders)
  - **Rutas/Canon page styles**: hero with gradient title, route sections (number, name, tesis, post count, card grid), canon list (numbered badges, cover thumbnails, tag, reason text), responsive breakpoints
  - **Revista styles**: magazine issue cards, cover images, collaborator grids
  - Post card grid normalization: `.post-cols .w-dyn-item` has `width: 100%` to ensure uniform card sizes
  - Mobile hiding for `.wm-root` and `.fb-window` at `<1024px` (moved from `window-manager.css` since it loads conditionally)
- `globals.css` - CSS variables (`--verde`, `--amarillo`, `--gradient-main`, etc.), font rendering (`antialiased`, `optimizeLegibility`). `--gradient-main: linear-gradient(280deg, var(--verde), var(--amarillo))` is used across all CSS files.
- `site-nav.css` - Navigation styles
- `file-browser.css` - File browser styles
- `window-manager.css` - Window manager styles. **Desktop only** — loaded conditionally via JS in `default.hbs` (`>=1024px`). Has its own `@media (max-width: 1023px)` hiding rules as fallback.
- `progress-bar.css` - Reading progress bar
- `suscribite.css` - Subscription page styles
- `webflow.css` / `udesly-ghost.css` - Base framework styles (don't edit)
- `normalize.css` - CSS reset
- `404.css` - 404 page styles

### JavaScript (`assets/js/`)
- **`render-card.js`** - Shared post card rendering module. Loaded **sync** (no defer) in `<head>` of `default.hbs` because it defines `window.renderCard()`, `window.escHtml()`, and `window.formatPostDate()` used by all card-rendering scripts. Also includes: document-level event delegation for card hover (mouseover/mouseout with `.closest('.post-card')`), IntersectionObserver for lazy-loading `textura.webp` (rootMargin 200px), and MutationObserver to detect dynamically-added cards. **IMPORTANT**: Must load sync before `{{{body}}}` — deferred loading breaks rutas/canon/related-posts that depend on `window.renderCard`.
- **`pagination.js`** - Unified pagination for all listing pages. Auto-detects page type from URL (home, tag, author) and configures API filter accordingly. Replaces the old `pagination-home.js`, `pagination-next.js`, `pagination-author.js`. Uses `window.renderCard()` from `render-card.js`. Prefetches next page for instant load-more.
- **`related-posts.js`** - Client-side semantic related posts. Tries Render endpoint first (`/api/related-posts.json`, 3s timeout), falls back to theme `related-posts.json`. Fetches related posts from Content API, renders cards via `window.renderCard()` replacing the Handlebars fallback.
- **`rutas.js`** - Client-side Rutas + Canon renderer. Loads `rutas.json`, fetches all posts by slug via Content API, renders card grids (for `/rutas/`) or numbered list with reasons (for `/canon/`). Detects language via URL prefix (`/en/`). Uses `window.renderCard()` from `render-card.js`.
- **`revista.js`** - Magazine issue renderer. Fetches `revista.json`, renders cards with cover image, issue number badge, date/title, collaborator grid with links, PDF download + view cover buttons. No Content API needed (pure static JSON).
- **`home-ruta.js`** - Weekly rotating reading route hero for homepage. Picks a different route each week (modulo 7), fetches up to 4 post cards via Content API. Uses `window.renderCard()`. Bilingual via `data-lang` container attribute.
- **`filter-posts.js`** - Archive page with filtering. 3 dropdowns (author, tag, order), load-more pagination (20 posts/page), auto language filtering via path detection. Tag/author dropdowns populated from native Ghost `/tags/` and `/authors/` API endpoints (not from fetching all posts). Uses `window.renderCard()`.
- `file-browser.js` - File browser navigation logic
- `window-manager.js` - Desktop-style window manager. **Desktop only** — loaded conditionally via JS in `default.hbs` (`>=1024px`).
- `reading-progress.js` - Reading progress bar
- `hide-show-nav.js` - Scroll-based nav visibility. Uses `matchMedia('(max-width: 768px)')` instead of `window.innerWidth` to avoid reflow on every scroll event.
- `pagination-home.js` / `pagination-next.js` / `pagination-author.js` - **Deprecated**, replaced by unified `pagination.js`. Still in repo for reference.
- `light-mode.js` - Centralized light/dark mode toggle. Handles sun/moon icon swap, localStorage persistence, and `.text-amarillo`↔`.text-verde` class swap for light mode. Loaded globally from `default.hbs`.
- `audio-effect.js` - Audio effects
- `seamless.js` - CSS-only page fade-in (no JS link interception). Animation defined in `index.css`.
- `udesly-ghost.min.js` - Framework JS (don't edit)

### Data (`assets/data/`)
- **`related-posts.json`** - Semantic related posts mapping. Keys = post slugs, values = arrays of 4 related post slugs. Generated by `scripts/update-related.py` and also auto-recomputed by the Render webhook service.
- **`hreflang-sitemap.xml`** - Hreflang sitemap with ES/EN post pairs. Submitted to Google Search Console. Generated by `scripts/generate-hreflang-sitemap.py`
- **`rutas.json`** - Editorial curation data for Rutas de lectura + Canon 421. Contains:
  - `rutas[]` / `rutas_en[]`: 7 thematic routes (ES/EN), each with `id`, `nombre`, `tesis`, and `slugs[]` (8-12 verified post slugs)
  - `canon[]` / `canon_en[]`: 25 essential posts (ES/EN), each with `slug` and `razon` (editorial reason)
  - All slugs verified against Content API. To add/remove posts from routes or canon, edit this file and redeploy.
  - **7 routes**: Autonomia digital (12), Cultura pop como teoria (12), Argentina como laboratorio (12), Filosofia para la vida real (12), El canon del entretenimiento (12), Internet no murio (11), Hazlo tu mismo (11)
- **`revista.json`** - Magazine issue data (11 issues, newest first). Each issue: `numero`, `titulo`, `fecha`, `cover` (image URL), `pdf` (download URL), `size`, `creditos[]` (array of `{rol, nombre, url}`). Issues range from #1 (Nov 2024) to #11 (Jan 2026).

### Scripts (`scripts/`)

#### Core update scripts
- **`update-related.py`** - Regenerates `related-posts.json` and uploads/activates the theme. Run: `python3 scripts/update-related.py`. Requires `scikit-learn` (`pip3 install scikit-learn`)
- **`generate-hreflang-sitemap.py`** - Generates `assets/data/hreflang-sitemap.xml` and optionally injects `<meta>` tags into posts via Admin API. 3-phase ES/EN pairing algorithm: manual overrides → timestamp+slug similarity → day-based singleton matching. Run: `python3 scripts/generate-hreflang-sitemap.py` (sitemap only), `python3 scripts/generate-hreflang-sitemap.py --inject-meta --deploy` (full update). Already applied: 121 pairs, 242 posts updated with hreflang meta tags.
- **`interlink-posts.py`** - Adds contextual internal links between posts via Ghost Admin API. Uses TF-IDF relatedness from `related-posts.json` + shared tags to find relevant targets. Has comprehensive Spanish stopwords, `PROMO_KEYWORDS` filter, requires `relevance >= 0.1`. Run: `python3 scripts/interlink-posts.py --dry-run --limit 10` to preview, `python3 scripts/interlink-posts.py --apply` to execute. Creates backup in `backups/`. Already applied to 428 posts (1544 links).
- `bulk-update-internal-links.py` - Bulk internal link updates
- `remove-episodio-links.py` - Remove episodio-specific links

#### SEO bulk fix scripts
- `fix-feature-image-alt.py` - Bulk sets `feature_image_alt` to post title for all posts
- `fix-tag-descriptions.py` - Sets description + meta_title for 26 public tags (ES/EN)
- `fix-author-bios.py` - Sets bios for missing author records
- `fix-post-seo-fields.py` - Fills missing `meta_title`, `og_title`, `og_description`, `twitter_*` fields
- `fix-tag-seo.py` - General tag SEO fixes
- `fix-page-seo.py` - General page SEO fixes

#### Content import scripts
- `import-p12-articles.py` / `import-p12-batch2.py` / `update-p12-batch2.py` - Import/update articles from P12 source
- `import-external-batch3.py` - External batch import
- `import-nuso-articles.py` - NUSO article imports

#### Webhook service (`scripts/webhook-hreflang/`)
Express.js microservice deployed on Render (https://webhook-hreflang.onrender.com, service `srv-d68brdg6fj8s73c1foqg`). Automates hreflang injection and related posts recomputation on post publish.

**Endpoints:**
- `GET /` - Health check (returns version)
- `POST /webhook/hreflang` - Ghost `post.published` webhook. Auto-detects ES/EN, finds matching pair via scoring (timestamp proximity + slug overlap), injects `<meta name="english-version">` / `<meta name="spanish-version">` tags. Threshold: score >= 0.3. Idempotent.
- `POST /webhook/related-posts` - Ghost webhook for related posts recompute. 10s debounce to coalesce rapid publishes. Pure JS TF-IDF + cosine similarity with CONCEPT_MAP (~100 semantic bridges). Processes ES/EN separately.
- `GET /api/related-posts.json` - Serves fresh related posts JSON. CORS for `www.421.news`, 60s cache. Client-side `related-posts.js` tries this first (3s timeout), falls back to theme asset.
- `POST /test` - Synchronous debug endpoint for hreflang (returns full result)

**Automation:**
- Self-ping every 14 min (prevents Render free tier spindown)
- Hreflang cron every 30 min (checks last 10 posts for missing hreflang, catches scheduled posts)
- On startup: loads existing `related-posts.json` from theme, recomputes fresh in background

#### Deprecated
- `compute-related.js` - Older Node.js version (deprecated, use the Python script)

### Other
- `server.js` - Express dev server with mock data for local preview
- `routes.yaml` - Ghost routing configuration. Root `/` points to `landing` template. Spanish collection at `/es/` (permalink `/es/{slug}/`, filters `tag:-hash-en`). English collection at `/en/` (permalink `/en/{slug}/`, filters `tag:hash-en`). ~50 custom routes + 28 tag page routes. See Routes section below.
- `redirects.yaml` - Ghost redirects configuration (111 rules: 103 permanent 301 + 8 temporary 302). Uploaded manually via Ghost Admin > Settings > Labs > Redirects. Handles `/es/` migration catch-all, slug merges, tag mappings, author slug completion, case insensitivity. See Redirects section below.
- `redirects.json` - JSON backup of redirects
- `package.json` - Theme metadata and version (currently **v3.10.0**)
- `layouts/default.hbs` - Express layout (dev server only)
- `testeo/` - Mockup HTML files for previewing features before implementation (mockup-cta-conversion, mockup-pitcheale, mockup-revista, mockup-rutas-canon, mockup-suscripcion-dual)
- `backups/` - API operation backups (lexical content, signup forms). Not committed.
- `.env` - Environment variables (GHOST_ADMIN_API_KEY). Not committed (in `.gitignore`).

## URL Structure (v3.0.0 migration)

As of v3.0.0, Spanish content moved from root `/` to `/es/` prefix:
- **Root `/`**: Landing page (minimal logo, browser language redirect)
- **`/es/{slug}/`**: Spanish posts
- **`/en/{slug}/`**: English posts
- **`/es/tag/{slug}/`**: Spanish tag pages
- **`/en/tag/{slug}/`**: English tag pages

All old root URLs (`/{slug}/`, `/tag/{slug}/`) are redirected to `/es/` equivalents via `redirects.yaml` catch-all rules.

## Routes Configuration (`routes.yaml`)

**Custom routes (~50):**
- `/` → `landing` template
- `/es/suscribite/`, `/en/subscribe/` → subscription pages
- `/es/rutas/`, `/en/routes/` → reading routes
- `/es/canon/`, `/en/canon/` → canon pages
- `/es/revista-421/` → magazine archive
- `/es/pitcheale-a-421/` → pitch/submission page
- `/es/mi-suscripcion/`, `/en/my-subscription/` → subscription management
- `/es/ultimos-posts/`, `/en/last-posts/` → archive pages with filtering
- `/gracias/`, `/oh-yes/` → thank you / confirmation pages
- 28 tag page routes (18 ES primary+secondary, 4 EN primary, 6 ES wiki/el-canon)

**Collections:**
- `/es/` → Spanish (permalink `/es/{slug}/`, filters `tag:-hash-en`, template `index`)
- `/en/` → English (permalink `/en/{slug}/`, filters `tag:hash-en`, template `en`)

**Taxonomies:** `/author/{slug}/`

## Redirects Configuration (`redirects.yaml`)

111 rules (103 permanent 301, 8 temporary 302). Key categories:
1. **Slug merges** (~15): Multi-part articles consolidated (Nick Land, Ricardo Fort, etc.)
2. **Wildcard `/posts/`** (1): `^/posts/(.*)` → `/es/$1` (old URL structure)
3. **Slug changes** (~30): Specific slug rewrites to `/es/` paths
4. **Bilingual path fixes** (4): EN tags at root → `/en/tag/...`
5. **Case insensitivity** (3): `[Tt]ecnolog`, `[Cc]ripto`, etc.
6. **Tag mapping** (7): Nonexistent tags → closest match
7. **Author slug completion** (9): Short slugs → full slugs
8. **`/es/` migration** (~6+2 catch-alls):
   - `/rutas/` → `/es/rutas/`, `/canon/` → `/es/canon/`, etc.
   - `^/tag/(.+)$` → `/es/tag/$1` (all root tags)
   - `^/(?!es/|en/|ghost/|assets/|content/|members/|public/|rss/|sitemap|robots|favicon|gracias|oh-yes|author/)([a-z0-9][-a-z0-9]*)/?$` → `/es/$1/` (post catch-all)
9. **302 temporary** (8): Tags without content (guerra, politica, economia) → `/es/`

## Bilingual System

Posts are tagged with internal tags `#es` (slug: `hash-es`) or `#en` (slug: `hash-en`). The `post.hbs` template checks this tag and routes to either `post-es.hbs` or `post-en.hbs`. Each language has its own:
- Navigation (`site-nav-es` / `site-nav-en`)
- File browser (`file-browser` / `file-browser-en`)
- Footer text
- Related posts query (filtered by `tag:hash-es` or `tag:hash-en`)
- Subscription flow (`/es/suscribite/` / `/en/subscribe/`)
- Archive page (`/es/ultimos-posts/` / `/en/last-posts/`)

`default.hbs` has a script that redirects English-language browsers from `/` to `/en/` (unless `prefersSpanish` is set in localStorage). Spanish browsers go to `/es/`.

`post.hbs` includes translation link JS that reads `english-version`/`spanish-version` meta tags and shows a cross-language link button ("Read it in english." / "Leer en espanol.") with `/es/` and `/en/` URL prefixes.

## Related Posts System

Two layers:

1. **Handlebars (server-side, instant)**: `{{#get "posts"}}` query in `post-es.hbs`/`post-en.hbs` matches by `primary_tag` + language. Falls back to any recent posts in the same language if no match.

2. **JavaScript (client-side, semantic)**: `related-posts.js` tries the Render endpoint first (`/api/related-posts.json`, 3s timeout) for fresh data, then falls back to the theme's static `related-posts.json`. Looks up the current post's slug, fetches the 4 related posts via Content API, and replaces the Handlebars-rendered cards. If the slug isn't found, the Handlebars version stays.

The JSON is generated by TF-IDF + cosine similarity with a semantic concept expansion layer (CONCEPT_MAP with ~100 bridges, e.g., "pokemon" -> anime, manga, tcg, videogame). Both the Python script and the Render webhook service use this algorithm.

**To update after publishing new posts** (automated via webhook, but can be done manually):
1. `python3 scripts/update-related.py` (regenerates related posts + deploys)
2. `python3 scripts/generate-hreflang-sitemap.py --inject-meta --deploy` (updates hreflang pairs + deploys)

## Rutas de Lectura + Canon System

Two curated editorial pages that transform the flat archive into navigable paths:

- **`/es/rutas/`** - 7 thematic reading routes (83 posts total). Each route has a name, thesis statement, and 8-12 ordered posts. Think of it as "start here" for different interests.
- **`/es/canon/`** - 25 essential texts with editorial reasons explaining why each one matters.

Architecture: `rutas.json` (static data) + `rutas.js` (client-side Content API fetching) + `rutas.hbs`/`canon.hbs` (templates). Same pattern as `related-posts.js`.

English versions at `/en/routes/` (`routes.hbs`) and `/en/canon/` (`canon-en.hbs`). `rutas.js` detects language via URL prefix (`/en/`) and uses `rutas_en`/`canon_en` keys from the JSON.

Homepage features a weekly rotating route via `home-ruta.js` (picks a different route each week, shows 4 post cards).

**To edit curation**: Modify `assets/data/rutas.json` and redeploy theme. All slugs must exist in Ghost.

## Revista 421 (Magazine System)

Digital magazine archive at `/es/revista-421/`. 11 issues (Nov 2024 - Jan 2026).

Architecture: `revista.json` (static data with issue metadata, cover URLs, PDF download links, collaborator credits) + `revista.js` (client-side renderer) + `revista.hbs` (template). No Content API needed — pure static JSON rendering.

Each issue card shows: cover image, issue number badge (gradient), date/title, collaborator grid with links (Instagram, X, 421.news author pages), PDF download button with file size, view cover button.

**To add issues**: Add entry to `assets/data/revista.json` and redeploy theme.

## Subscription System

Multi-layered conversion flow:
- **Subscribe popup** (`partials/subscribe-popup.hbs`): Modal CTA at 20% scroll depth for non-members. 7-day dismiss cooldown via localStorage. Bilingual.
- **Sticky mobile button** (`partials/sticky-subscribe-mobile-button.hbs`): Full-width mobile subscribe button. Text/href adapted for EN by `default.hbs`.
- **Subscription pages**: `/es/suscribite/` (ES) and `/en/subscribe/` (EN)
- **Management pages**: `/es/mi-suscripcion/` and `/en/my-subscription/` (noindex). Shows paid/free/guest states. Paid members get link to MTG Collection app (https://mtg.421.news). Fetches `/members/api/member/` to check status. Sign out button destroys session via `DELETE /members/api/session` and reloads page.
- **Thank you pages**: `/gracias/` (ES) and `/oh-yes/` (EN)

## Pitcheale a 421 (Community Submissions)

Page at `/es/pitcheale-a-421/` for community pitch submissions. Three category tabs with custom SVG icons and embedded Google Form iframes:
1. **Escritura** (`icono_escritura.svg`) - essays, chronicles, guides, tutorials
2. **Ilustracion** (`icono_ilustracion.svg`) - covers, editorial art, comics
3. **Videojuegos** (`icono_videojuegos.svg`) - indie devs, demos, game jams

## Internal Linking System

`scripts/interlink-posts.py` adds contextual `<a>` links between posts by:
1. Loading `related-posts.json` to build a semantic relatedness graph (1st + 2nd degree connections)
2. Finding anchor text in each post that matches titles of related posts
3. Requiring `relevance >= 0.1` (semantic score + shared tag bonus of 0.3/tag)
4. Filtering anchors through comprehensive Spanish stopwords (single words must be 7+ chars)
5. Skipping promo/newsletter posts

Already applied: 428 posts modified, 1544 links added. Backup at `backups/lexical-backup-*.json`.

## Signup Form Removal

307 posts had manually-inserted HTML cards containing `<script src="signup-form.min.js">` (the "421 Broadcasting Network" subscribe widget). These were removed via Admin API. Backup at `backups/signup-form-backup-*.json`. Additionally, `default.hbs` removes any `.gh-post-upgrade-cta` elements injected by Ghost Portal via `querySelectorAll` + 2 setTimeout calls (at 0ms and 3000ms).

## Key CSS Variables (from globals.css)

- `--negro: #121212` - Dark background
- `--crema: #eae6e1` - Light/cream text
- `--amarillo: #fcd221` - Yellow/gold accent
- `--verde: #17a583` - Green accent
- `--radius: 8px` - Border radius
- `--border-width: 2px` - Border width
- `--gradient-main: linear-gradient(280deg, var(--verde), var(--amarillo))` - Primary gradient (used in 22+ places across CSS files)

## Design Rules

- **Body text color**: Always use `var(--crema)` for text on dark background (full white, not semi-transparent). Light mode override: `var(--negro)`. Never use `rgba()` with reduced opacity for body text — it makes it hard to read.

## Ghost-specific Notes

- `{{#get}}` queries use NQL (Ghost Query Language) for filters
- `{{#foreach}}` inside `{{#get}}` filter attributes does NOT work - generates invalid NQL
- `{{#get}}`'s own `{{else}}` properly detects 0 results (unlike `{{#if variable}}` on empty arrays)
- `{{asset "path"}}` resolves to `/assets/path?v=HASH`
- `{{#page}}` context is required to access page fields in `page.hbs`
- Ghost's `cards.min.css` has high-specificity rules for `.kg-*` classes that need to be overridden carefully
- Internal tags (starting with `#`) are excluded from `primary_tag`
- Ghost Admin API token CANNOT upload `routes.yaml` or `redirects.yaml` (returns 403). Must be done manually via Ghost Admin > Settings > Labs > Routes / Redirects.
- Ghost Admin API token CANNOT modify site settings (`PUT /settings/`) either (returns 403). Publication logo, icon, etc. must be changed via Ghost Admin UI.
- Ghost redirects (YAML format) use regex matching on `from` patterns. **Always use `^` anchors** to prevent substring matching (e.g., `/magic-the-gathering/` without anchor also matches `/tag/magic-the-gathering/`). Ghost lowercases URLs before matching, so patterns must be lowercase. Ghost does NOT match URLs with Unicode/accented characters (URL-encoded paths like `/tag/tecnolog%c3%ada` bypass the redirect engine).
- Post content is stored as Lexical JSON. Node types: `paragraph`, `html`, `image`, `embed`, `heading`, `list`, etc. The `html` type contains raw HTML strings.
- When updating posts via Admin API, `updated_at` must match the current value (optimistic locking).

## Performance Optimizations

### v2.10.2 — Initial cleanup
- **Textures**: Deleted 4 unused responsive variants (`textura-p-*.png`, 1.73MB). Converted `textura.png` to `textura.webp` (1.5MB → 779KB). All references updated.
- **Script loading**: All `<script>` tags have `defer`. Replaced WebFont.js loader with native CSS `display=swap` Google Fonts link.
- **Light mode consolidation**: Extracted 20 inline light-mode toggle blocks into single `assets/js/light-mode.js` loaded from `default.hbs`. Removed `querySelectorAll("div")` border-color hack (was iterating every div on page).
- **Seamless.js**: Removed JS link interception (was adding 1s delay to all clicks). Page fade-in now handled by CSS `@keyframes pageFadeIn` in `index.css`.
- **Dead code cleanup**: Removed console.logs from pagination/audio scripts, commented-out sections from footer/post/index templates, duplicate CSS rules, redundant WebFont.js loads from tag templates.
- **Font rendering**: Added `-webkit-font-smoothing: antialiased`, `-moz-osx-font-smoothing: grayscale`, `text-rendering: optimizeLegibility` to `globals.css` body.

### v3.9.0–v3.10.0 — 3-phase performance plan
**Phase 1 — Quick wins:**
- **Conditional window-manager.js**: Only loads on desktop (`>=1024px`). Saves 24KB on mobile (~80% of users).
- **Inline script guards**: JSON-LD publisher logo patch has early return if no `ld+json` scripts on page. Saves ~20ms on non-post pages.
- **Simplified CTA removal**: Replaced MutationObserver + 4 setTimeout with simple `querySelectorAll` + 2 setTimeout. Eliminates continuous DOM observation overhead.

**Phase 2 — JS consolidation:**
- **Shared `render-card.js`**: Extracted `renderCard()`, `formatPostDate()`, `escHtml()` from 5 duplicate files (~300 lines each) into single shared module. Loaded sync in `<head>`. Saves ~8-12KB.
- **Unified `pagination.js`**: Replaced 3 near-identical pagination scripts (`pagination-home.js`, `pagination-next.js`, `pagination-author.js`) with one parametrized module. Auto-detects page type from URL. Saves ~10-12KB.
- **Native API endpoints for filter-posts.js**: Tag/author dropdown population now uses `/tags/` and `/authors/` Ghost Content API endpoints instead of fetching all posts with `limit=all`. Saves 50-80% payload on archive pages.
- **Event delegation**: Replaced per-card inline `onmouseover`/`onmouseout` handlers with 2 document-level listeners using `.closest('.post-card')`.

**Phase 3 — Deep optimization:**
- **Conditional `window-manager.css`**: Desktop only (`>=1024px`), loaded via JS. Mobile hiding rules (`.wm-root`, `.fb-window`) moved to `index.css` to prevent unstyled elements on mobile.
- **Lazy-load `textura.webp` (779KB)**: Removed inline `background-image` from `post-card.hbs` and `renderCard()`. IntersectionObserver in `render-card.js` (rootMargin 200px) sets texture when overlays approach viewport. MutationObserver detects dynamically-added cards (pagination, rutas, etc.).
- **`matchMedia` in `hide-show-nav.js`**: Replaced `window.innerWidth` (forces reflow on every scroll) with `matchMedia('(max-width: 768px)')` evaluated once + change listener.
- **`--gradient-main` CSS variable**: Defined `linear-gradient(280deg, var(--verde), var(--amarillo))` in `:root`. Replaced 22 occurrences across `index.css`, `site-nav.css`, `suscribite.css`.

## SEO

- **Google Analytics 4**: `G-ZN49MRKKCQ`, configured via Ghost Code Injection (not in theme files)
- **Google Search Console**: Verified via GA property. Hreflang sitemap submitted at `https://www.421.news/assets/data/hreflang-sitemap.xml`
- **IndexNow**: Active on Ghost, key `3066583d158ea23df246f650cc680d48`
- **Hreflang**: Server-side `<link rel="alternate" hreflang>` tags in `default.hbs` for homepage. Client-side JS reads `english-version`/`spanish-version` meta tags (auto-injected by Render webhook on publish, or manually by `generate-hreflang-sitemap.py`) for posts. Self-referential hreflang for all posts.
- **BreadcrumbList JSON-LD**: Added to `post-es.hbs`, `post-en.hbs` (Home > Tag > Title), all 28 tag templates via `partials/breadcrumb-tag.hbs`, and `author.hbs` (Home > Author Name).
- **Article JSON-LD fix**: Ghost's `{{ghost_head}}` generates Article schema with publisher logo but omits `width`/`height` (regardless of image format). Inline script in `default.hbs` patches the JSON-LD post-render to add the correct 125x60 PNG URL with dimensions. Google's renderer executes JS before reading structured data, so this works. Publisher logo PNG uploaded at `https://www.421.news/content/images/2026/02/logo-421-publisher.png`.
- **SEO bulk fixes**: Scripts in `scripts/` for comprehensive Ghost field maintenance: `fix-feature-image-alt.py` (alt text), `fix-tag-descriptions.py` (26 tags), `fix-author-bios.py`, `fix-post-seo-fields.py` (meta_title, og_title, og_description, twitter_*), `fix-tag-seo.py`, `fix-page-seo.py`.
- **Redirects**: `redirects.yaml` with 111 rules (103 permanent, 8 temporary). Handles `/es/` migration catch-all, slug merges, tag mappings, author slug completion, case insensitivity, old `/posts/` prefix, bilingual path corrections. Ghost limitation: URLs with Unicode accents (`/tag/Tecnologia` etc.) cannot be redirected.
- **Non-www → www redirect (Cloudflare)**: DNS migrated from GoDaddy to Cloudflare (free) to fix non-www `421.news` → `www.421.news` redirect from 302 (Caddy VPS) to 301 (permanent). Setup:
  - **DNS**: A record `@` → `192.0.2.1` (Proxied/orange cloud, dummy IP for redirect), CNAME `www` → `421bn.ghost.io` (DNS only/grey cloud), 5 MX records (Google Workspace), 3 TXT records (SPF + Google site verification)
  - **Page Rule**: `421.news/*` → Forwarding URL 301 → `https://www.421.news/$1` (preserves path)
  - **SSL/TLS**: Flexible mode (required because origin IP is dummy)
  - **Always Use HTTPS**: Enabled (handles `http://` → `https://` upgrade)
  - **Nameservers**: `evan.ns.cloudflare.com` / `stella.ns.cloudflare.com` (set in GoDaddy)
  - **Redirect chain**: `http://421.news/path` → 301 → `https://421.news/path` → 301 → `https://www.421.news/path` → 200

## Webhook Automation (Render)

Express.js microservice at https://webhook-hreflang.onrender.com handles two Ghost webhooks:

1. **Hreflang auto-injection** (`POST /webhook/hreflang`): On `post.published`, detects language, finds matching pair via scoring algorithm (timestamp proximity + slug word overlap, threshold >= 0.3), injects `<meta>` tags. Cron fallback every 30 min checks last 10 posts for missing hreflang (catches scheduled posts).

2. **Related posts recompute** (`POST /webhook/related-posts`): On post publish, recomputes TF-IDF + cosine similarity for all posts (10s debounce). Serves fresh JSON at `GET /api/related-posts.json` (60s cache, CORS for www.421.news). Client-side `related-posts.js` tries this endpoint first (3s timeout) before falling back to theme asset.

Self-pings every 14 min to prevent Render free tier spindown.

## Pending / Future Features (from "Filosofia 421" roadmap)

Features identified but not yet implemented:
- **Content type badges** - Visual indicators on cards (ensayo, guia, cronica, tutorial, wiki)
- **"Que es 421" page** - Institutional about page
- **Author territories** - Each author gets a visible territory/beat
