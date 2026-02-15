# 421.news - Ghost Theme Project

## Overview
Ghost CMS theme for **421.news**, a bilingual (ES/EN) blog about culture, gaming, tech, and real life. The site runs on Ghost Pro at `421bn.ghost.io` (public URL: `www.421.news`).

## Credentials

- **Ghost Admin API Key**: `GHOST_ADMIN_API_KEY_REDACTED`
- **Ghost Content API Key**: `420da6f85b5cc903b347de9e33`
- **Ghost instance**: `421bn.ghost.io` (redirects to `www.421.news`)
- **GitHub repo**: `https://github.com/421news/web.git` (branch: `main`)
- **Render API Key**: `RENDER_API_KEY_REDACTED`
- **Render webhook-hreflang service**: `srv-d68brdg6fj8s73c1foqg` (URL: `https://webhook-hreflang.onrender.com`)

## Deploy Workflow

1. Edit files
2. Bump version in `package.json`
3. Zip (excluding `.git/`, `node_modules/`, `.github/`, `scripts/`, `testeo/`, `backups/`, `mockup-*.html`)
4. Upload via Ghost Admin API (`POST /ghost/api/admin/themes/upload/`)
5. Activate via Admin API (`PUT /ghost/api/admin/themes/421-theme/activate/`)
6. Auth: JWT signed with HMAC-SHA256 using the Admin API key

**IMPORTANT**: `routes.yaml` CANNOT be uploaded via API token (returns 403). It requires cookie-based staff auth. The user must upload it manually via Ghost Admin > Settings > Labs > Routes.

Quick deploy (zip + upload + activate):
```bash
cd /home/realjuanruocco/Escritorio/claude/421-web
zip -r /tmp/421-theme.zip . -x ".git/*" "node_modules/*" ".github/*" "scripts/*" "testeo/*" "mockup-*.html" "backups/*" "*.zip"
node -e "
const jwt = require('jsonwebtoken');
const FormData = require('form-data');
const fs = require('fs');
const https = require('https');
const [id, secret] = 'GHOST_ADMIN_API_KEY_REDACTED'.split(':');
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
- `default.hbs` - Main layout. Loads Google Fonts (Nunito Sans + Lora) via CSS `display=swap`, global CSS, `light-mode.js`. Has MutationObserver to remove Ghost Portal signup CTA, hreflang injection, browser language redirect to /en/. Includes inline script to patch Ghost's Article JSON-LD publisher logo with correct PNG URL + width/height (Ghost omits dimensions).
- `index.hbs` - Spanish homepage
- `en.hbs` - English homepage
- `post.hbs` - Post router: checks `#en` tag to pick `post-en.hbs` or `post-es.hbs`
- `page.hbs` - Static pages. Has `{{#page}}` context for title/feature_image
- **`rutas.hbs`** - Reading routes page (`/rutas/`). Loads `rutas.js` which fetches posts from Content API and renders 7 curated thematic routes.
- **`canon.hbs`** - Canon 421 page (`/canon/`). Loads `rutas.js` which fetches 25 essential posts with editorial reasons.
- **`revista.hbs`** - Revista 421 page (`/revista-421/`). Loads `revista.js` which fetches `revista.json` and renders magazine issue cards with covers, download links, and collaborator credits.
- `tag.hbs` - Tag listing page
- `tags.hbs` - All tags page
- `author.hbs` - Author page
- `error-404.hbs` - 404 page
- `tag-*.hbs` - Custom templates per tag (cultura, juegos, tech, vida-real, etc.)
- `tag-secundario-*.hbs` - Secondary tag templates
- `subscribe.hbs` / `suscribite.hbs` - Subscription pages (EN/ES)

### Partials (`partials/`)
- **`post-es.hbs`** - Spanish post template. Contains article body, author box, related posts query, file browser
- **`post-en.hbs`** - English post template. Same structure as post-es but with EN text and `hash-en` filters
- `post-card.hbs` - Post card component (used in grids). Has hover effect with texture overlay
- `post-header.hbs` / `featured-post-header.hbs` - Post header with feature image
- `site-nav-es.hbs` / `site-nav-en.hbs` - Navigation bars
- `site-footer.hbs` - Footer
- `file-browser.hbs` / `file-browser-en.hbs` - File browser navigation component. Sidebar has: Marcadores (Inicio, Cultura, Tecnologia, Juegos, Vida real) + Sistema (Rutas, Canon, Suscribite, Revista). Grid has folders + rutas.sh, canon.sh, suscribite.sh, revista.pdf, ultimos.log.
- `breadcrumb-tag.hbs` - Reusable BreadcrumbList JSON-LD partial for tag pages. Accepts `tagName` and optional `lang` parameters.
- `general-styling.hbs` - Inline style partial (CSS variables, etc.)
- `reading-progress-bar.hbs` - Reading progress bar component
- `index-featured-post.hbs` / `index-featured-post-mobile.hbs` - Featured post on homepage
- `index-highlighted-posts-es.hbs` / `index-highlighted-posts-en.hbs` - Highlighted posts grids
- `last-posts-*.hbs` - Latest posts sections
- `tag-preview-section.hbs` - Tag preview sections
- `window-manager.hbs` - Desktop-style window manager UI component

### CSS (`assets/css/`)
- **`index.css`** - Main custom CSS. All theme overrides go here:
  - Gallery breakout (1200px max, center with transform)
  - Bookmark card thumbnail gap fix
  - Header card centering
  - HR gradient divider (`linear-gradient(280deg, var(--verde), var(--amarillo))`)
  - Link styling (gradient text, no double underline from `<u>` tags)
  - Caption link gradient
  - Rich text: Lora serif font, line-height 1.5, figcaption 15px
  - h2/h3: Nunito Sans, margin-top 4rem, margin-bottom 1.5rem
  - Blockquote gradient border
  - Page hero (no borders)
  - **Rutas/Canon page styles**: hero with gradient title, route sections (number, name, tesis, post count, card grid), canon list (numbered badges, cover thumbnails, tag, reason text), responsive breakpoints
  - Post card grid normalization: `.post-cols .w-dyn-item` has `width: 100%` to ensure uniform card sizes
- `globals.css` - CSS variables (`--verde`, `--amarillo`, etc.), font rendering (`antialiased`, `optimizeLegibility`)
- `site-nav.css` - Navigation styles
- `file-browser.css` - File browser styles
- `window-manager.css` - Window manager styles
- `progress-bar.css` - Reading progress bar
- `suscribite.css` - Subscription page styles
- `webflow.css` / `udesly-ghost.css` - Base framework styles (don't edit)
- `normalize.css` - CSS reset
- `404.css` - 404 page styles

### JavaScript (`assets/js/`)
- **`related-posts.js`** - Client-side semantic related posts. Loads `related-posts.json`, fetches related posts from Content API, renders cards replacing the Handlebars fallback
- **`rutas.js`** - Client-side Rutas + Canon renderer. Loads `rutas.json`, fetches all posts by slug via Content API, renders card grids (for `/rutas/`) or numbered list with reasons (for `/canon/`). Same `renderCard()` pattern as `related-posts.js`.
- **`revista.js`** - Client-side Revista 421 renderer. Loads `revista.json` and renders magazine issue cards with cover image, download button, "ver tapa" button, and collaborator credits with links. No Content API needed.
- `file-browser.js` - File browser navigation logic
- `window-manager.js` - Desktop-style window manager
- `reading-progress.js` - Reading progress bar
- `hide-show-nav.js` - Scroll-based nav visibility
- `pagination-home.js` / `pagination-next.js` - Pagination logic
- `light-mode.js` - Centralized light/dark mode toggle. Handles sun/moon icon swap, localStorage persistence, and `.text-amarillo`↔`.text-verde` class swap for light mode. Loaded globally from `default.hbs`.
- `audio-effect.js` - Audio effects
- `seamless.js` - CSS-only page fade-in (no JS link interception). Animation defined in `index.css`.
- `udesly-ghost.min.js` - Framework JS (don't edit)

### Data (`assets/data/`)
- **`related-posts.json`** - Semantic related posts mapping. Keys = post slugs, values = arrays of 4 related post slugs. Generated by `scripts/update-related.py`
- **`hreflang-sitemap.xml`** - Hreflang sitemap with ES/EN post pairs. Submitted to Google Search Console. Generated by `scripts/generate-hreflang-sitemap.py`
- **`rutas.json`** - Editorial curation data for Rutas de lectura + Canon 421. Contains:
  - `rutas[]` / `rutas_en[]`: 7 thematic routes (ES/EN), each with `id`, `nombre`, `tesis`, and `slugs[]` (8-12 verified post slugs)
  - `canon[]` / `canon_en[]`: 25 essential posts (ES/EN), each with `slug` and `razon` (editorial reason)
  - All slugs verified against Content API. To add/remove posts from routes or canon, edit this file and redeploy.
  - **7 routes**: Autonomia digital (12), Cultura pop como teoria (12), Argentina como laboratorio (12), Filosofia para la vida real (12), El canon del entretenimiento (12), Internet no murio (11), Hazlo tu mismo (11)
- **`revista.json`** - Magazine issue data for Revista 421. Array of 11 objects (newest first), each with `numero`, `titulo`, `fecha`, `cover` (image URL), `pdf` (download URL), `size`, and `creditos[]` (array of `{rol, nombre, url}`). To add a new issue: add object at the beginning of the array and redeploy theme.

### Scripts (`scripts/`)
- **`update-related.py`** - Regenerates `related-posts.json` and uploads/activates the theme. Run: `python3 scripts/update-related.py`. Requires `scikit-learn` (`pip3 install scikit-learn`)
- **`interlink-posts.py`** - Adds contextual internal links between posts via Ghost Admin API. Uses TF-IDF relatedness from `related-posts.json` + shared tags to find relevant targets. Has comprehensive Spanish stopwords, `PROMO_KEYWORDS` filter, requires `relevance >= 0.1`. Run: `python3 scripts/interlink-posts.py --dry-run --limit 10` to preview, `python3 scripts/interlink-posts.py --apply` to execute. Creates backup in `backups/`. Already applied to 428 posts (1544 links).
- **`generate-hreflang-sitemap.py`** - Generates `assets/data/hreflang-sitemap.xml` and optionally injects `<meta>` tags into posts via Admin API. 3-phase ES/EN pairing algorithm: manual overrides → timestamp+slug similarity → day-based singleton matching. Run: `python3 scripts/generate-hreflang-sitemap.py` (sitemap only), `python3 scripts/generate-hreflang-sitemap.py --inject-meta --deploy` (full update). Already applied: 121 pairs, 242 posts updated with hreflang meta tags.
- **`fix-feature-image-alt.py`** - Bulk sets `feature_image_alt` to post title for all posts missing alt text. Run: `python3 scripts/fix-feature-image-alt.py --dry-run` to preview, `--apply` to execute. Already applied: 490 posts updated. Backup at `backups/feature-image-alt-backup-*.json`.
- **`fix-tag-descriptions.py`** - Sets `description` and `meta_title` for all 26 public tags. Editorial descriptions per tag (ES/EN). Run: `python3 scripts/fix-tag-descriptions.py --apply`. Already applied: 26 tags updated.
- **`fix-author-bios.py`** - Sets bios for authors missing them. Bios researched from public sources + post history. Run: `python3 scripts/fix-author-bios.py --apply`. Note: Ghost Admin API token returns 403 for user modifications — requires cookie-based session auth (email + password + 2FA). Already applied: 15 authors updated.
- **`fix-post-seo-fields.py`** - Bulk fills missing `meta_title`, `og_title`, `og_description`, `twitter_title`, `twitter_description` with sensible defaults (post title / excerpt). Run: `python3 scripts/fix-post-seo-fields.py --apply`. Already applied: 545 posts updated.
- `compute-related.js` - Older Node.js version (deprecated, use the Python script)
- **`webhook-hreflang/`** - Express.js service deployed on Render. Receives Ghost `post.published` webhook, auto-pairs ES/EN posts by timestamp+slug similarity, injects hreflang meta tags via Admin API. See "Webhook: Hreflang Auto-Inject" section below.

### Other
- `server.js` - Express dev server with mock data for local preview
- `routes.yaml` - Ghost routing configuration. Custom routes include `/rutas/`, `/canon/`, `/en/routes/`, `/en/canon/`, `/suscribite/`, tag pages, EN equivalents. Collections: `/` filters `tag:-hash-en` (ES), `/en/` filters `tag:hash-en` (EN).
- `redirects.yaml` - Ghost redirects configuration (46 rules). Uploaded manually via Ghost Admin > Settings > Labs > Redirects. Uses regex patterns with `^` anchors for precise matching. Covers: `/posts/` prefix wildcard, truncated slugs, EN tags in ES paths, wrong-case tags, nonexistent tags → closest match, incomplete author slugs. **IMPORTANT**: Like `routes.yaml`, this CANNOT be uploaded via API token (returns 403).
- `package.json` - Theme metadata and version (currently v2.12.0)
- `layouts/default.hbs` - Express layout (dev server only)
- `testeo/` - Mockup files for previewing features before implementation
- `backups/` - API operation backups (lexical content, signup forms, feature image alt, tag descriptions, author bios, post SEO fields). Not committed.

## Bilingual System

Posts are tagged with internal tags `#es` (slug: `hash-es`) or `#en` (slug: `hash-en`). The `post.hbs` template checks this tag and routes to either `post-es.hbs` or `post-en.hbs`. Each language has its own:
- Navigation (`site-nav-es` / `site-nav-en`)
- File browser (`file-browser` / `file-browser-en`)
- Footer text
- Related posts query (filtered by `tag:hash-es` or `tag:hash-en`)

`default.hbs` has a script that redirects English-language browsers from `/` to `/en/` (unless `prefersSpanish` is set in localStorage).

### Language filtering in tag pages

Tag page templates use 3 partials that filter by language via a `languageFilter` parameter:
- `tag-page-featured-post.hbs` — `languageFilter` MUST be passed (no default — `{{#if}}` inside `{{#get}}` filter breaks Ghost's NQL parser)
- `tag-page-highlighted-posts-es.hbs` — `languageFilter` MUST be passed (same reason)
- `tag-page-highlighted-posts-en.hbs` — requires `languageFilter="'hash-en'"` explicitly
- `last-posts-es-tag.hbs` / `last-posts-en-tag.hbs` — hardcoded language filter

ES tag templates pass `languageFilter="-'hash-en'"`, EN templates pass `languageFilter="'hash-en'"`.

### Adding a third language (~March 2026)

Current approach uses **exclusion** (`-'hash-en'`): each language excludes others. This doesn't scale because adding a language (e.g., `#zh`) means updating all existing filters to also exclude the new tag.

**Recommended migration**: switch from exclusion to **inclusion** (`+'hash-es'`). Each language filters for its own tag only:
- ES partials: `tag:'hash-es'` instead of `tag:-'hash-en'`
- EN partials: `tag:'hash-en'` (unchanged)
- ZH partials: `tag:'hash-zh'`

Steps to implement:
1. Ensure ALL posts have their own language tag (`#es` on every Spanish post — currently most do, verify with Content API)
2. Update `tag-page-featured-post.hbs` default from `-'hash-en'` to `'hash-es'`
3. Update `tag-page-highlighted-posts-es.hbs` default from `-'hash-en'` to `'hash-es'`
4. Update `last-posts-es-tag.hbs` hardcoded filter from `tag:-'hash-en'` to `tag:'hash-es'`
5. Update `last-posts-es-secondary-tag.hbs` same change
6. Update all ES tag template invocations: `languageFilter="'hash-es'"`
7. Create ZH equivalents: `post-zh.hbs`, `site-nav-zh.hbs`, `file-browser-zh.hbs`, tag templates, etc.
8. Add `/zh/` collection in `routes.yaml` with `filter: 'tag:hash-zh'`
9. Update `default.hbs` browser redirect logic for 3 languages
10. Update hreflang system (sitemap + meta tags + webhook) for 3-way pairing

## Related Posts System

Two layers:

1. **Handlebars (server-side, instant)**: `{{#get "posts"}}` query in `post-es.hbs`/`post-en.hbs` matches by `primary_tag` + language. Falls back to any recent posts in the same language if no match.

2. **JavaScript (client-side, semantic)**: `related-posts.js` loads `related-posts.json`, looks up the current post's slug, fetches the 4 related posts via Content API, and replaces the Handlebars-rendered cards. If the slug isn't in the JSON (new post), the Handlebars version stays.

The JSON is generated by TF-IDF + cosine similarity with a semantic concept expansion layer (CONCEPT_MAP in the Python script) that bridges related topics (e.g., "pokemon" -> anime, manga, tcg, videogame).

**To update after publishing new posts**:
1. `python3 scripts/update-related.py` (regenerates related posts + deploys)
2. Hreflang meta tags are injected automatically via webhook (see "Webhook: Hreflang Auto-Inject" section). For bulk updates or manual overrides, use: `python3 scripts/generate-hreflang-sitemap.py --inject-meta --deploy`

## Rutas de Lectura + Canon System

Two curated editorial pages that transform the flat archive into navigable paths:

- **`/rutas/`** - 7 thematic reading routes (83 posts total). Each route has a name, thesis statement, and 8-12 ordered posts. Think of it as "start here" for different interests.
- **`/canon/`** - 25 essential texts with editorial reasons explaining why each one matters.

Architecture: `rutas.json` (static data) + `rutas.js` (client-side Content API fetching) + `rutas.hbs`/`canon.hbs` (templates). Same pattern as `related-posts.js`.

English versions at `/en/routes/` (`routes.hbs`) and `/en/canon/` (`canon-en.hbs`). `rutas.js` detects language via URL prefix (`/en/`) and uses `rutas_en`/`canon_en` keys from the JSON.

**To edit curation**: Modify `assets/data/rutas.json` and redeploy theme. All slugs must exist in Ghost.

## Revista 421 System

Digital magazine archive page at `/revista-421/` showing all 11 issues as cards.

Architecture: `revista.json` (static data) + `revista.js` (client-side renderer) + `revista.hbs` (template) + CSS in `index.css` (`.revista-*` classes). Same pattern as rutas/canon but simpler — no Content API calls needed since all data is in the JSON.

Each card shows:
- Cover image (clickable to full resolution)
- Issue number badge (gradient), date, title
- Collaborator credits with links (Instagram/X/421.news author pages)
- "Descargar PDF" button (gradient, with file size) + "Ver tapa" button (outline)

Responsive: horizontal cards on desktop, vertical stacking on mobile (<768px).
Light mode: card backgrounds, borders, and credit link colors adapt automatically.

**To add a new issue monthly**:
1. Upload cover image and PDF to Ghost
2. Add a new object at the **beginning** of `assets/data/revista.json`:
```json
{
  "numero": 12,
  "titulo": "Especial Tema",
  "fecha": "Febrero 2026",
  "cover": "https://www.421.news/content/images/...",
  "pdf": "https://storage.ghost.io/.../Revista-421--12--.pdf",
  "size": "X MB",
  "creditos": [
    { "rol": "Tapa", "nombre": "Artista", "url": "https://instagram.com/..." },
    { "rol": "Diseño", "nombre": "Pablo Tempesta", "url": "https://www.instagram.com/pmtempesta" }
  ]
}
```
3. Redeploy theme (zip + upload + activate)

**Route**: `/revista-421/: revista` in `routes.yaml` (uploaded manually via Ghost Admin > Settings > Labs > Routes).

## Internal Linking System

`scripts/interlink-posts.py` adds contextual `<a>` links between posts by:
1. Loading `related-posts.json` to build a semantic relatedness graph (1st + 2nd degree connections)
2. Finding anchor text in each post that matches titles of related posts
3. Requiring `relevance >= 0.1` (semantic score + shared tag bonus of 0.3/tag)
4. Filtering anchors through comprehensive Spanish stopwords (single words must be 7+ chars)
5. Skipping promo/newsletter posts

Already applied: 428 posts modified, 1544 links added. Backup at `backups/lexical-backup-*.json`.

## Webhook: Hreflang Auto-Inject

Express.js service on Render that automatically injects hreflang meta tags when posts are published, eliminating the need to manually run `generate-hreflang-sitemap.py --inject-meta`.

**Architecture**: Ghost webhook (`post.published`) → Render service → Content API (find pair) → Admin API (inject meta tags)

**Flow**:
1. Ghost fires `post.published` webhook to `https://webhook-hreflang.onrender.com/webhook/hreflang`
2. Service determines language via `hash-en` tag presence
3. Fetches 50 most recent posts in the other language via Content API
4. Scores candidates: posts within 2 min auto-match (1.0); posts within 48h with shared slug words score 0.6 + temporal proximity (0..0.4); threshold 0.3
5. If match found, injects `<meta name="english-version">` / `<meta name="spanish-version">` in both posts via Admin API
6. Idempotent: skips posts that already have the correct meta tag

**Infrastructure**:
- **Render service**: `srv-d68brdg6fj8s73c1foqg` (`https://webhook-hreflang.onrender.com`)
- **Ghost webhook ID**: `6990c16183e4d70001b309bc` (event: `post.published`)
- **Code**: `scripts/webhook-hreflang/` (server.js + package.json)
- **Env vars** (in Render dashboard): `GHOST_ADMIN_KEY`, `GHOST_CONTENT_KEY`, `GHOST_URL`, `PORT`
- Auto-deploys from GitHub `main` branch on push

**Endpoints**:
- `GET /` — Health check
- `POST /webhook/hreflang` — Main webhook handler (responds 200 immediately, processes async)
- `POST /test` — Synchronous debug endpoint (returns full result JSON)

**Note**: For bulk updates (e.g., after adding manual pairs to `MANUAL_PAIRS` dict), still use `python3 scripts/generate-hreflang-sitemap.py --inject-meta --deploy`. The webhook only handles new posts.

## Signup Form Removal

307 posts had manually-inserted HTML cards containing `<script src="signup-form.min.js">` (the "421 Broadcasting Network" subscribe widget). These were removed via Admin API. Backup at `backups/signup-form-backup-*.json`. Additionally, `default.hbs` has a MutationObserver that removes any `.gh-post-upgrade-cta` elements injected by Ghost Portal.

## Key CSS Variables (from globals.css)

- `--negro: #121212` - Dark background
- `--crema: #eae6e1` - Light/cream text
- `--amarillo: #fcd221` - Yellow/gold accent
- `--verde: #17a583` - Green accent
- `--radius: 8px` - Border radius
- `--border-width: 2px` - Border width
- Used in gradients: `linear-gradient(280deg, var(--verde), var(--amarillo))`

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
- Ghost Admin API token CANNOT modify users/staff profiles (`PUT /users/`) either (returns 403). Author bios, meta_title, etc. require cookie-based session auth: `POST /ghost/api/admin/session/` with `{username, password, token}` (token = 2FA code sent to email). Session cookie name: `ghost-admin-api-session`.
- Ghost redirects (YAML format) use regex matching on `from` patterns. **Always use `^` anchors** to prevent substring matching (e.g., `/magic-the-gathering/` without anchor also matches `/tag/magic-the-gathering/`). Ghost lowercases URLs before matching, so patterns must be lowercase. Ghost does NOT match URLs with Unicode/accented characters (URL-encoded paths like `/tag/tecnolog%c3%ada` bypass the redirect engine).
- Post content is stored as Lexical JSON. Node types: `paragraph`, `html`, `image`, `embed`, `heading`, `list`, etc. The `html` type contains raw HTML strings.
- When updating posts via Admin API, `updated_at` must match the current value (optimistic locking).

## Performance Optimizations (v2.10.2)

Applied in bulk cleanup pass:
- **Textures**: Deleted 4 unused responsive variants (`textura-p-*.png`, 1.73MB). Converted `textura.png` to `textura.webp` (1.5MB → 779KB). All references updated.
- **Script loading**: All `<script>` tags have `defer`. Replaced WebFont.js loader with native CSS `display=swap` Google Fonts link.
- **Light mode consolidation**: Extracted 20 inline light-mode toggle blocks into single `assets/js/light-mode.js` loaded from `default.hbs`. Removed `querySelectorAll("div")` border-color hack (was iterating every div on page).
- **Seamless.js**: Removed JS link interception (was adding 1s delay to all clicks). Page fade-in now handled by CSS `@keyframes pageFadeIn` in `index.css`.
- **Dead code cleanup**: Removed console.logs from pagination/audio scripts, commented-out sections from footer/post/index templates, duplicate CSS rules, redundant WebFont.js loads from tag templates.
- **Font rendering**: Added `-webkit-font-smoothing: antialiased`, `-moz-osx-font-smoothing: grayscale`, `text-rendering: optimizeLegibility` to `globals.css` body.

## SEO

- **Google Analytics 4**: `G-ZN49MRKKCQ`, configured via Ghost Code Injection (not in theme files)
- **Google Search Console**: Verified via GA property. Hreflang sitemap submitted at `https://www.421.news/assets/data/hreflang-sitemap.xml`
- **IndexNow**: Active on Ghost, key `3066583d158ea23df246f650cc680d48`
- **Hreflang**: Server-side `<link rel="alternate" hreflang>` tags in `default.hbs` for homepage. Client-side JS reads `english-version`/`spanish-version` meta tags (injected via `codeinjection_head` by `generate-hreflang-sitemap.py`) for posts. Self-referential hreflang for all posts.
- **BreadcrumbList JSON-LD**: Added to `post-es.hbs`, `post-en.hbs` (Home > Tag > Title), all 28 tag templates via `partials/breadcrumb-tag.hbs`, and `author.hbs` (Home > Author Name).
- **Article JSON-LD fix**: Ghost's `{{ghost_head}}` generates Article schema with publisher logo but omits `width`/`height` (regardless of image format). Inline script in `default.hbs` patches the JSON-LD post-render to add the correct 125x60 PNG URL with dimensions. Google's renderer executes JS before reading structured data, so this works. Publisher logo PNG uploaded at `https://www.421.news/content/images/2026/02/logo-421-publisher.png`.
- **Redirects**: `redirects.yaml` with 46 rules handles all GSC 404 errors. Key patterns: wildcard `^/posts/(.*)` → `/$1` for old URL structure, regex-anchored slug redirects, EN tags at ES paths → `/en/tag/...`, case-insensitive tag matching via `[Tt]` regex, incomplete author slugs → full slugs. 37/40 verified working; 3 URLs with Unicode accents (`/tag/Tecnología` etc.) cannot be redirected due to Ghost limitation.
- **Non-www → www redirect (Cloudflare)**: DNS migrated from GoDaddy to Cloudflare (free) to fix non-www `421.news` → `www.421.news` redirect from 302 (Caddy VPS) to 301 (permanent). Setup:
  - **DNS**: A record `@` → `192.0.2.1` (Proxied/orange cloud, dummy IP for redirect), CNAME `www` → `421bn.ghost.io` (DNS only/grey cloud), 5 MX records (Google Workspace), 3 TXT records (SPF + Google site verification)
  - **Page Rule**: `421.news/*` → Forwarding URL 301 → `https://www.421.news/$1` (preserves path)
  - **SSL/TLS**: Flexible mode (required because origin IP is dummy)
  - **Always Use HTTPS**: Enabled (handles `http://` → `https://` upgrade)
  - **Nameservers**: `evan.ns.cloudflare.com` / `stella.ns.cloudflare.com` (set in GoDaddy)
  - **Redirect chain**: `http://421.news/path` → 301 → `https://421.news/path` → 301 → `https://www.421.news/path` → 200
  - This fixes ~415 "Discovered - currently not indexed" URLs in GSC caused by the old 302 redirect
  - **mtg subdomain**: CNAME `mtg` → `cname.vercel-dns.com` (DNS only/grey cloud). Points to the MTG Collection app on Vercel. Must be DNS only — Vercel handles its own SSL.
- **SEO Bulk Audit (completed)**: Comprehensive audit and fix of all Ghost SEO fields via Admin API scripts:
  - `feature_image_alt`: 490 posts — set to post title (was 95% empty)
  - Tag `description` + `meta_title`: 26 tags — editorial descriptions per tag (ES/EN)
  - Author `bio`: 15 authors — researched from public sources (required cookie auth)
  - Author `meta_title`: 73 authors — set to "Name | 421.news" (required cookie auth)
  - Post `meta_title`: 191 posts — set to post title
  - Post `og_title`/`og_description`: 510 posts — set to title/excerpt
  - Post `twitter_title`/`twitter_description`: 504 posts — set to title/excerpt
  - Backups for all operations in `backups/`

## Migration: `/` → `/es/` (planned)

Migrate Spanish content from root (`/{slug}/`) to `/es/{slug}/` so both languages have explicit prefixes. Root `/` becomes a neutral landing that redirects by browser language. This eliminates SEO ambiguity where Google confuses ES/EN content on the root URL.

### Current state
- Spanish: `https://www.421.news/{slug}/` (root collection)
- English: `https://www.421.news/en/{slug}/`
- Problem: `/` is ambiguous — serves Spanish content but Googlebot (Chrome, lang=en) gets JS-redirected to `/en/`, causing Google to index English content for the root URL

### Target state
- Spanish: `https://www.421.news/es/{slug}/`
- English: `https://www.421.news/en/{slug}/`
- Root `/`: neutral landing page or auto-redirect (no collection)

### Automated steps (Claude does all of these)

1. **`routes.yaml`**: Change ES collection from `/` to `/es/` with `permalink: /es/{slug}/`. Add root `/` as a route pointing to a landing template or redirect
2. **Theme templates**: Update all ES templates (`index.hbs`, `rutas.hbs`, `canon.hbs`, `revista.hbs`, `pitcheale.hbs`, `suscribite.hbs`, tag templates, etc.) — internal links from `/{slug}/` → `/es/{slug}/`
3. **`default.hbs`**: Update browser language redirect to point to `/es/` or `/en/` from root. Update hreflang tags
4. **Navigation partials**: Update `site-nav-es.hbs`, `file-browser.hbs` links to use `/es/` prefix
5. **`redirects.yaml`**: Generate ~450 redirect rules: `^/{slug}/$ → /es/{slug}/` for every existing Spanish post. Also redirect ES tag pages `^/tag/{slug}/ → /es/tag/{slug}/`, author pages, etc.
6. **Hreflang sitemap**: Regenerate `hreflang-sitemap.xml` with `/es/` URLs
7. **Hreflang post meta tags**: Re-run `generate-hreflang-sitemap.py --inject-meta` to update `codeinjection_head` on all paired posts
8. **Internal links in posts**: Script to update the ~1544 internal links in post content from `/{slug}/` to `/es/{slug}/` via Admin API
9. **`related-posts.json`**: No change needed (stores slugs, not full URLs — JS builds URLs dynamically)
10. **`rutas.json`**: No change needed (stores slugs, not full URLs)

### Manual steps (user must do these — ~5 actions)

1. **Upload `routes.yaml`**: Ghost Admin > Settings > Labs > Routes > Upload YAML
2. **Upload `redirects.yaml`**: Ghost Admin > Settings > Labs > Redirects > Upload YAML
3. **Google Search Console**: Submit updated sitemap URL. Use "Request Indexing" on `https://www.421.news/es/` to accelerate crawl. Monitor "Page indexing" report over the next 2-4 weeks for the URL migration
4. **Cloudflare Page Rule** (optional): If we want a server-side fallback redirect for `/` → `/es/` (in case JS doesn't execute), add a Page Rule: `www.421.news/` → 302 → `https://www.421.news/es/` (use 302 not 301, since the root should remain neutral). Current Page Rule `421.news/*` for non-www redirect stays as-is
5. **Verify**: Check a few pages at `/es/{slug}/` work, old `/{slug}/` URLs 301-redirect correctly, and hreflang tags are correct

### Risks and notes
- Ghost's `redirects.yaml` has a practical limit (~500 rules). With ~450 Spanish posts, we're close. If needed, use a wildcard `^/(?!es/|en/|ghost/|assets/|tag/|author/)([^/]+)/$ → /es/$1/` instead of per-slug rules
- Google will show a temporary dip in indexed pages during re-crawl (2-4 weeks)
- All existing backlinks and shared URLs will continue to work via 301 redirects
- The `/en/` collection and all EN URLs remain unchanged
- RSS feed URL may change — verify after migration

## Pending / Future Features (from "Filosofia 421" roadmap)

Features identified but not yet implemented:
- **Content type badges** - Visual indicators on cards (ensayo, guia, cronica, tutorial, wiki)
- **"Que es 421" page** - Institutional about page
- **Author territories** - Each author gets a visible territory/beat
- **Archive as system** - Transform chronological archive into navigable system (partially done with rutas/canon)
