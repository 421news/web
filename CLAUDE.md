# 421.news - Ghost Theme Project

## Overview
Ghost CMS theme for **421.news**, a bilingual (ES/EN) blog about culture, gaming, tech, and real life. The site runs on Ghost Pro at `421bn.ghost.io` (public URL: `www.421.news`).

## Credentials

- **Ghost Admin API Key**: `GHOST_ADMIN_API_KEY_REDACTED`
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
- `default.hbs` - Main layout. Loads Google Fonts (Nunito Sans + Lora), WebFont loader, global CSS. Has MutationObserver to remove Ghost Portal signup CTA, hreflang injection, browser language redirect to /en/.
- `index.hbs` - Spanish homepage
- `en.hbs` - English homepage
- `post.hbs` - Post router: checks `#en` tag to pick `post-en.hbs` or `post-es.hbs`
- `page.hbs` - Static pages. Has `{{#page}}` context for title/feature_image
- **`rutas.hbs`** - Reading routes page (`/rutas/`). Loads `rutas.js` which fetches posts from Content API and renders 7 curated thematic routes.
- **`canon.hbs`** - Canon 421 page (`/canon/`). Loads `rutas.js` which fetches 25 essential posts with editorial reasons.
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
- `globals.css` - CSS variables (`--verde`, `--amarillo`, etc.)
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
- `file-browser.js` - File browser navigation logic
- `window-manager.js` - Desktop-style window manager
- `reading-progress.js` - Reading progress bar
- `hide-show-nav.js` - Scroll-based nav visibility
- `pagination-home.js` / `pagination-next.js` - Pagination logic
- `audio-effect.js` - Audio effects
- `seamless.js` - Seamless scrolling
- `udesly-ghost.min.js` - Framework JS (don't edit)

### Data (`assets/data/`)
- **`related-posts.json`** - Semantic related posts mapping. Keys = post slugs, values = arrays of 4 related post slugs. Generated by `scripts/update-related.py`
- **`rutas.json`** - Editorial curation data for Rutas de lectura + Canon 421. Contains:
  - `rutas[]`: 7 thematic routes, each with `id`, `nombre`, `tesis`, and `slugs[]` (8-12 verified post slugs)
  - `canon[]`: 25 essential posts, each with `slug` and `razon` (editorial reason)
  - All slugs verified against Content API. To add/remove posts from routes or canon, edit this file and redeploy.
  - **7 routes**: Autonomia digital (12), Cultura pop como teoria (12), Argentina como laboratorio (12), Filosofia para la vida real (12), El canon del entretenimiento (12), Internet no murio (11), Hazlo tu mismo (11)

### Scripts (`scripts/`)
- **`update-related.py`** - Regenerates `related-posts.json` and uploads/activates the theme. Run: `python3 scripts/update-related.py`. Requires `scikit-learn` (`pip3 install scikit-learn`)
- **`interlink-posts.py`** - Adds contextual internal links between posts via Ghost Admin API. Uses TF-IDF relatedness from `related-posts.json` + shared tags to find relevant targets. Has comprehensive Spanish stopwords, `PROMO_KEYWORDS` filter, requires `relevance >= 0.1`. Run: `python3 scripts/interlink-posts.py --dry-run --limit 10` to preview, `python3 scripts/interlink-posts.py --apply` to execute. Creates backup in `backups/`. Already applied to 428 posts (1544 links).
- `compute-related.js` - Older Node.js version (deprecated, use the Python script)

### Other
- `server.js` - Express dev server with mock data for local preview
- `routes.yaml` - Ghost routing configuration. Custom routes include `/rutas/`, `/canon/`, `/suscribite/`, tag pages, EN equivalents. Collections: `/` filters `tag:-hash-en` (ES), `/en/` filters `tag:hash-en` (EN).
- `package.json` - Theme metadata and version (currently v2.7.1)
- `layouts/default.hbs` - Express layout (dev server only)
- `testeo/` - Mockup files for previewing features before implementation
- `backups/` - API operation backups (lexical content, signup forms). Not committed.

## Bilingual System

Posts are tagged with internal tags `#es` (slug: `hash-es`) or `#en` (slug: `hash-en`). The `post.hbs` template checks this tag and routes to either `post-es.hbs` or `post-en.hbs`. Each language has its own:
- Navigation (`site-nav-es` / `site-nav-en`)
- File browser (`file-browser` / `file-browser-en`)
- Footer text
- Related posts query (filtered by `tag:hash-es` or `tag:hash-en`)

`default.hbs` has a script that redirects English-language browsers from `/` to `/en/` (unless `prefersSpanish` is set in localStorage).

## Related Posts System

Two layers:

1. **Handlebars (server-side, instant)**: `{{#get "posts"}}` query in `post-es.hbs`/`post-en.hbs` matches by `primary_tag` + language. Falls back to any recent posts in the same language if no match.

2. **JavaScript (client-side, semantic)**: `related-posts.js` loads `related-posts.json`, looks up the current post's slug, fetches the 4 related posts via Content API, and replaces the Handlebars-rendered cards. If the slug isn't in the JSON (new post), the Handlebars version stays.

The JSON is generated by TF-IDF + cosine similarity with a semantic concept expansion layer (CONCEPT_MAP in the Python script) that bridges related topics (e.g., "pokemon" -> anime, manga, tcg, videogame).

**To update after publishing new posts**: `python3 scripts/update-related.py`

## Rutas de Lectura + Canon System

Two curated editorial pages that transform the flat archive into navigable paths:

- **`/rutas/`** - 7 thematic reading routes (83 posts total). Each route has a name, thesis statement, and 8-12 ordered posts. Think of it as "start here" for different interests.
- **`/canon/`** - 25 essential texts with editorial reasons explaining why each one matters.

Architecture: `rutas.json` (static data) + `rutas.js` (client-side Content API fetching) + `rutas.hbs`/`canon.hbs` (templates). Same pattern as `related-posts.js`.

**To edit curation**: Modify `assets/data/rutas.json` and redeploy theme. All slugs must exist in Ghost.

## Internal Linking System

`scripts/interlink-posts.py` adds contextual `<a>` links between posts by:
1. Loading `related-posts.json` to build a semantic relatedness graph (1st + 2nd degree connections)
2. Finding anchor text in each post that matches titles of related posts
3. Requiring `relevance >= 0.1` (semantic score + shared tag bonus of 0.3/tag)
4. Filtering anchors through comprehensive Spanish stopwords (single words must be 7+ chars)
5. Skipping promo/newsletter posts

Already applied: 428 posts modified, 1544 links added. Backup at `backups/lexical-backup-*.json`.

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
- Ghost Admin API token CANNOT upload `routes.yaml` (returns 403). Must be done manually via Ghost Admin > Settings > Labs > Routes.
- Post content is stored as Lexical JSON. Node types: `paragraph`, `html`, `image`, `embed`, `heading`, `list`, etc. The `html` type contains raw HTML strings.
- When updating posts via Admin API, `updated_at` must match the current value (optimistic locking).

## Pending / Future Features (from "Filosofia 421" roadmap)

Features identified but not yet implemented:
- **Content type badges** - Visual indicators on cards (ensayo, guia, cronica, tutorial, wiki)
- **"Que es 421" page** - Institutional about page
- **Author territories** - Each author gets a visible territory/beat
- **Archive as system** - Transform chronological archive into navigable system (partially done with rutas/canon)
