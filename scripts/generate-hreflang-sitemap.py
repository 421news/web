#!/usr/bin/env python3
"""
Generates hreflang sitemap and optionally injects translation meta tags into posts.

Usage:
  python3 scripts/generate-hreflang-sitemap.py              # Generate sitemap only
  python3 scripts/generate-hreflang-sitemap.py --inject-meta # Also inject meta tags into posts
  python3 scripts/generate-hreflang-sitemap.py --deploy      # Generate + deploy theme
  python3 scripts/generate-hreflang-sitemap.py --dry-run     # Preview pairs without writing
"""

import json
import os
import sys
import time
import hmac
import hashlib
import base64
import urllib.request
import subprocess
from collections import defaultdict
from datetime import datetime

CONTENT_API_KEY = '420da6f85b5cc903b347de9e33'
ADMIN_KEY = 'GHOST_ADMIN_API_KEY_REDACTED'
GHOST_HOST = 'www.421.news'
ADMIN_HOST = '421bn.ghost.io'
SITE_URL = 'https://www.421.news'
THEME_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUTPUT_PATH = os.path.join(THEME_DIR, 'assets', 'data', 'hreflang-sitemap.xml')


# --- JWT Auth (for Admin API) ---
def make_jwt():
    key_id, secret_hex = ADMIN_KEY.split(':')
    secret = bytes.fromhex(secret_hex)

    header = base64.urlsafe_b64encode(json.dumps(
        {"alg": "HS256", "typ": "JWT", "kid": key_id}
    ).encode()).rstrip(b'=').decode()

    now = int(time.time())
    payload = base64.urlsafe_b64encode(json.dumps(
        {"iat": now, "exp": now + 300, "aud": "/admin/"}
    ).encode()).rstrip(b'=').decode()

    signature = hmac.new(secret, f"{header}.{payload}".encode(), hashlib.sha256).digest()
    sig_b64 = base64.urlsafe_b64encode(signature).rstrip(b'=').decode()

    return f"{header}.{payload}.{sig_b64}"


def api_get_admin(path):
    token = make_jwt()
    req = urllib.request.Request(
        f'https://{ADMIN_HOST}{path}',
        headers={'Authorization': f'Ghost {token}'}
    )
    with urllib.request.urlopen(req) as resp:
        return json.loads(resp.read())


def api_put(path, data):
    token = make_jwt()
    body = json.dumps(data).encode()
    req = urllib.request.Request(
        f'https://{ADMIN_HOST}{path}',
        data=body,
        method='PUT',
        headers={
            'Authorization': f'Ghost {token}',
            'Content-Type': 'application/json'
        }
    )
    with urllib.request.urlopen(req) as resp:
        return json.loads(resp.read())


# --- Fetch all posts ---
def fetch_all_posts():
    """Fetch all posts from Content API with tags and published_at."""
    all_posts = []
    page = 1
    while True:
        url = (f'https://{GHOST_HOST}/ghost/api/content/posts/'
               f'?key={CONTENT_API_KEY}&page={page}&limit=100'
               f'&include=tags&fields=id,slug,title,published_at,updated_at,url')
        print(f'  Fetching page {page}...')
        with urllib.request.urlopen(url) as resp:
            data = json.loads(resp.read())
        if 'posts' not in data:
            print(f'  Error: {json.dumps(data)[:200]}')
            break
        all_posts.extend(data['posts'])
        if not data['meta']['pagination'].get('next'):
            break
        page += 1
    return all_posts


# --- Classify posts by language ---
def classify_posts(posts):
    """Separate posts into ES and EN based on #en/#es internal tags."""
    es_posts = []
    en_posts = []
    for p in posts:
        tags = p.get('tags', [])
        tag_slugs = [t.get('slug', '') for t in tags]
        if 'hash-en' in tag_slugs:
            en_posts.append(p)
        else:
            es_posts.append(p)
    return es_posts, en_posts


# --- Parse timestamp ---
def parse_ts(ts_str):
    """Parse Ghost published_at into a Unix timestamp."""
    if not ts_str:
        return None
    # Format: 2026-02-12T08:00:51.000-03:00
    # Strip milliseconds and parse with timezone
    clean = ts_str.replace('.000', '')
    try:
        # Python 3.7+ handles timezone offset in fromisoformat
        dt = datetime.fromisoformat(clean)
        return dt.timestamp()
    except Exception:
        return None


# --- Slug word similarity ---
def slug_words(slug, min_len=4):
    """Extract meaningful words from a slug (words >= min_len chars)."""
    return set(w for w in slug.split('-') if len(w) >= min_len)


def slugs_share_words(slug_a, slug_b):
    """Check if two slugs share at least one meaningful word."""
    return bool(slug_words(slug_a) & slug_words(slug_b))


# Manual overrides for pairs that can't be matched by timestamp+slug
# Format: 'es-slug': 'en-slug'
MANUAL_PAIRS = {
    'poesia-ia-modelos-de-lenguaje': 'ai-and-poetry-human-poiesis-against-llm',
    'la-voz-de-los-muertos-hauntologia': 'the-voice-of-the-dead-hauntology-divinity-and-disintegration',
    'experiencias-del-home-office': 'living-room-war-diary-a-decade-working-from-home',
    'ropa-vintage-la-inca': 'collecting-vintage-designer-clothing',
    'entrevista-victoria-de-masi-cronica': 'write-journalism-chronicles-victoria-de-masi',
    'mejores-libros-ciencia-ficcion': 'science-fiction-reading-guide',
    'reconocer-contenido-generado-por-ia': 'how-to-recognize-ai-generated-visual-content',
    'derecho-constitucional-en-star-wars': 'constitutional-law-in-star-wars',
    'entrevista-luciano-lamberti-cuentos': 'interviews-with-writers-luciano-lamberti',
    'videos-verticales-algoritmos-en-medios': 'the-vertical-society-916-videos',
    'como-los-videojuegos-estan-cambiando-al-mundo-marijam-didzgalvyte': 'how-videogames-are-changing-the-world',
    'vas-a-ir-por-el-100-la-trampa-del-completismo-en-los-videojuegos': 'completionism-in-video-games',
    'historia-del-cine-slasher': 'a-history-of-slasher-cinema',
    'la-trampa-de-la-cultura-joven': 'the-trap-of-youth-culture',
    'buenos-aires-bluegrass-en-parque-avellaneda': 'buenos-aires-bluegrass',
    'la-pampa-rock-en-la-ruta-del-desierto': 'new-rock-on-the-argentine-desert-route',
    'festival-buenos-aires-rojo-sangre': 'buenos-aires-rojo-sangre-horror-festival',
    'diego-silvani-amoeba-whisper': 'whisper-and-amoeba-remember-lirios',
    'anonimato-en-internet': 'defense-internet-anonymity',
    'volverse-ingobernable-peter-sloterdijk': 'becoming-ungovernable-peter-sloterdijk',
    'como-armar-una-biblioteca': 'como-armar-una-biblioteca-en',
    'gauchito-gil-historia': 'gauchito-gil-antonio-mamerto-gil',
    'recordando-a-karina-vismara': 'remembering-karina-vismara',
    'que-es-la-psicodelia': 'psychedelia-for-dummies',
    'helado-heladerias-argentinas': 'argentina-ice-cream-story',
    '1998-videojuegos-musica-cine': '1998-the-last-great-year-of-the-20th-century',
    'por-que-amamos-el-pixel-art': 'why-we-still-love-pixel-art',
    'cannabis-industrial-en-argentina': 'vancouver-to-rosario-cannabis-model',
    'lecturas-politicas-sobre-lovecraft': 'yarvin-houellebecq-land-fisher-political-readings-of-lovecraft',
    'bateria-solos-bateristas-rock': 'the-drumstick-community-drums-solos-and-rock-drummers',
    'music-wins-musica-contra-la-maquina': 'music-against-the-machine-a-post-music-wins-post',
    'que-es-una-fujoshi': 'being-a-fujoshi',
    'dani-umpi-podcast-dormitivo': 'dani-umpi-sleepy-time-podcast',
    'la-historia-de-ricardo-fort': 'ricardo-fort-the-real-super-chad',
    'como-pitchear-videojuegos': 'how-to-pitch-your-video-game-to-a-publisher',
    'metajuego-que-es': 'what-is-the-metagame',
    'devconnect-argentina-2025-ethereum': 'devconnect-argentina-ethereum-biggest-event',
    'pop-os-linux': 'pop-os-guide-to-installing-linux-pc',
    'san-jorge-santo-matadragones': 'saint-george-dragon-slayer',
}


# --- Match ES/EN pairs by closest published_at (global greedy + slug check) ---
def match_pairs(es_posts, en_posts):
    """Match ES and EN posts by closest published_at, with slug word validation."""
    MAX_DELTA_UNCONDITIONAL = 120   # Pairs within 2 min are always accepted
    MAX_DELTA_WITH_CHECK = 172800   # Pairs within 48h accepted if slugs share words

    # Build slug->post lookup
    es_by_slug = {p['slug']: p for p in es_posts}
    en_by_slug = {p['slug']: p for p in en_posts}

    matched_es = set()
    matched_en = set()
    pairs = []

    # Phase 1: Apply manual overrides
    for es_slug, en_slug in MANUAL_PAIRS.items():
        if es_slug in es_by_slug and en_slug in en_by_slug:
            pairs.append((es_by_slug[es_slug], en_by_slug[en_slug]))
            matched_es.add(es_slug)
            matched_en.add(en_slug)

    # Phase 2: Timestamp-based matching
    candidates = []
    for es_p in es_posts:
        if es_p['slug'] in matched_es:
            continue
        es_ts = parse_ts(es_p.get('published_at', ''))
        if not es_ts:
            continue
        for en_p in en_posts:
            if en_p['slug'] in matched_en:
                continue
            en_ts = parse_ts(en_p.get('published_at', ''))
            if not en_ts:
                continue
            delta = abs(es_ts - en_ts)
            if delta < MAX_DELTA_WITH_CHECK:
                candidates.append((delta, es_p['slug'], en_p['slug'], es_p, en_p))

    candidates.sort(key=lambda x: x[0])

    for delta, es_slug, en_slug, es_p, en_p in candidates:
        if es_slug in matched_es or en_slug in matched_en:
            continue
        # Unconditionally accept very close pairs
        if delta <= MAX_DELTA_UNCONDITIONAL:
            pairs.append((es_p, en_p))
            matched_es.add(es_slug)
            matched_en.add(en_slug)
        # For wider deltas, require slug word overlap
        elif slugs_share_words(es_slug, en_slug):
            pairs.append((es_p, en_p))
            matched_es.add(es_slug)
            matched_en.add(en_slug)

    # Phase 3: Day-based singleton matching
    # If exactly 1 unmatched ES and 1 unmatched EN post on the same day, pair them
    remaining_es = [p for p in es_posts if p['slug'] not in matched_es]
    remaining_en = [p for p in en_posts if p['slug'] not in matched_en]

    es_by_date = defaultdict(list)
    en_by_date = defaultdict(list)
    for p in remaining_es:
        dt = p.get('published_at', '')[:10]  # YYYY-MM-DD
        if dt:
            es_by_date[dt].append(p)
    for p in remaining_en:
        dt = p.get('published_at', '')[:10]
        if dt:
            en_by_date[dt].append(p)

    MAX_DELTA_DAY = 7200  # 2 hours max for day-based singleton matching
    for date in en_by_date:
        if date in es_by_date and len(en_by_date[date]) == 1 and len(es_by_date[date]) == 1:
            es_p = es_by_date[date][0]
            en_p = en_by_date[date][0]
            if es_p['slug'] not in matched_es and en_p['slug'] not in matched_en:
                es_ts = parse_ts(es_p.get('published_at', ''))
                en_ts = parse_ts(en_p.get('published_at', ''))
                if es_ts and en_ts and abs(es_ts - en_ts) < MAX_DELTA_DAY:
                    pairs.append((es_p, en_p))
                    matched_es.add(es_p['slug'])
                    matched_en.add(en_p['slug'])

    unpaired_es = [p for p in es_posts if p['slug'] not in matched_es]
    unpaired_en_posts = [p for p in en_posts if p['slug'] not in matched_en]

    return pairs, unpaired_es, unpaired_en_posts


# --- Generate hreflang sitemap XML ---
def generate_sitemap(pairs, unpaired_es, unpaired_en):
    """Generate a hreflang sitemap XML file."""
    lines = [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"',
        '        xmlns:xhtml="http://www.w3.org/1999/xhtml">',
        '',
        '  <!-- Homepage -->',
        '  <url>',
        f'    <loc>{SITE_URL}/es/</loc>',
        f'    <xhtml:link rel="alternate" hreflang="es" href="{SITE_URL}/es/" />',
        f'    <xhtml:link rel="alternate" hreflang="en" href="{SITE_URL}/en/" />',
        f'    <xhtml:link rel="alternate" hreflang="x-default" href="{SITE_URL}/" />',
        '  </url>',
        '  <url>',
        f'    <loc>{SITE_URL}/en/</loc>',
        f'    <xhtml:link rel="alternate" hreflang="es" href="{SITE_URL}/es/" />',
        f'    <xhtml:link rel="alternate" hreflang="en" href="{SITE_URL}/en/" />',
        f'    <xhtml:link rel="alternate" hreflang="x-default" href="{SITE_URL}/" />',
        '  </url>',
        '',
    ]

    # Paired posts
    if pairs:
        lines.append('  <!-- Bilingual post pairs -->')
    for es_p, en_p in pairs:
        es_url = f'{SITE_URL}/es/{es_p["slug"]}/'
        en_url = f'{SITE_URL}/en/{en_p["slug"]}/'
        lines.extend([
            '  <url>',
            f'    <loc>{es_url}</loc>',
            f'    <xhtml:link rel="alternate" hreflang="es" href="{es_url}" />',
            f'    <xhtml:link rel="alternate" hreflang="en" href="{en_url}" />',
            '  </url>',
            '  <url>',
            f'    <loc>{en_url}</loc>',
            f'    <xhtml:link rel="alternate" hreflang="es" href="{es_url}" />',
            f'    <xhtml:link rel="alternate" hreflang="en" href="{en_url}" />',
            '  </url>',
        ])

    # Unpaired ES posts (self-referential only)
    if unpaired_es:
        lines.append('')
        lines.append('  <!-- Spanish-only posts -->')
    for p in unpaired_es:
        url = f'{SITE_URL}/es/{p["slug"]}/'
        lines.extend([
            '  <url>',
            f'    <loc>{url}</loc>',
            f'    <xhtml:link rel="alternate" hreflang="es" href="{url}" />',
            '  </url>',
        ])

    # Unpaired EN posts (self-referential only)
    if unpaired_en:
        lines.append('')
        lines.append('  <!-- English-only posts -->')
    for p in unpaired_en:
        url = f'{SITE_URL}/en/{p["slug"]}/'
        lines.extend([
            '  <url>',
            f'    <loc>{url}</loc>',
            f'    <xhtml:link rel="alternate" hreflang="en" href="{url}" />',
            '  </url>',
        ])

    lines.append('</urlset>')
    lines.append('')
    return '\n'.join(lines)


# --- Inject meta tags into posts via Admin API ---
def inject_meta_tags(pairs):
    """Inject codeinjection_head meta tags so the JS hreflang system works."""
    print(f'\nInjecting meta tags into {len(pairs)} post pairs ({len(pairs)*2} posts)...')
    success = 0
    errors = 0

    for i, (es_p, en_p) in enumerate(pairs):
        # ES post gets english-version meta tag
        es_meta = f'<meta name="english-version" content="{en_p["slug"]}" />'
        # EN post gets spanish-version meta tag
        en_meta = f'<meta name="spanish-version" content="{es_p["slug"]}" />'

        for post, meta_tag, label in [
            (es_p, es_meta, f'ES:{es_p["slug"]}'),
            (en_p, en_meta, f'EN:{en_p["slug"]}')
        ]:
            try:
                # Fetch current post to get updated_at
                current = api_get_admin(
                    f'/ghost/api/admin/posts/{post["id"]}/'
                )
                updated_at = current['posts'][0]['updated_at']
                existing_injection = current['posts'][0].get('codeinjection_head') or ''

                # Skip if meta tag already exists
                if meta_tag in existing_injection:
                    continue

                # Append to existing injection or set new
                new_injection = (existing_injection + '\n' + meta_tag).strip() if existing_injection else meta_tag

                api_put(
                    f'/ghost/api/admin/posts/{post["id"]}/',
                    {'posts': [{'codeinjection_head': new_injection, 'updated_at': updated_at}]}
                )
                success += 1
            except Exception as e:
                print(f'  Error updating {label}: {e}')
                errors += 1

        if (i + 1) % 20 == 0:
            print(f'  Processed {i + 1}/{len(pairs)} pairs...')
            # Refresh JWT periodically (it expires in 5 min)

    print(f'  Done: {success} posts updated, {errors} errors')


# --- Deploy theme ---
def upload_and_activate():
    """Zip the theme, upload to Ghost, and activate."""
    zip_path = '/tmp/421-theme.zip'
    if os.path.exists(zip_path):
        os.remove(zip_path)

    print('\nZipping theme...')
    subprocess.run(
        ['zip', '-r', zip_path, '.', '-x', '.git/*', 'node_modules/*', '.github/*',
         'scripts/*', 'testeo/*', 'backups/*', 'mockup-*.html'],
        cwd=THEME_DIR, capture_output=True
    )

    print('Uploading and activating...')
    script = f"""
    const jwt = require('jsonwebtoken');
    const fs = require('fs');
    const FormData = require('form-data');
    const https = require('https');
    const key = '{ADMIN_KEY}';
    const [id, secret] = key.split(':');
    const token = jwt.sign({{}}, Buffer.from(secret, 'hex'), {{ keyid: id, algorithm: 'HS256', expiresIn: '5m', audience: '/admin/' }});
    const form = new FormData();
    form.append('file', fs.createReadStream('{zip_path}'));
    const req = https.request({{
      hostname: '{ADMIN_HOST}', path: '/ghost/api/admin/themes/upload/', method: 'POST',
      headers: {{ ...form.getHeaders(), 'Authorization': 'Ghost ' + token }}
    }}, (res) => {{
      let data = '';
      res.on('data', chunk => {{ data += chunk; }});
      res.on('end', () => {{
        console.log('Upload:', res.statusCode);
        const req2 = https.request({{
          hostname: '{ADMIN_HOST}', path: '/ghost/api/admin/themes/421-theme/activate/', method: 'PUT',
          headers: {{ 'Authorization': 'Ghost ' + token, 'Content-Length': 0 }}
        }}, (res2) => {{
          let d2 = ''; res2.on('data', (c) => {{ d2 += c; }});
          res2.on('end', () => console.log('Activate:', res2.statusCode));
        }});
        req2.end();
      }});
    }});
    form.pipe(req);
    """
    subprocess.run(['node', '-e', script], cwd=THEME_DIR)


# --- Main ---
def main():
    args = set(sys.argv[1:])
    dry_run = '--dry-run' in args
    inject_meta = '--inject-meta' in args
    deploy = '--deploy' in args

    print('Fetching all posts...')
    posts = fetch_all_posts()
    print(f'  Total: {len(posts)} posts')

    es_posts, en_posts = classify_posts(posts)
    print(f'  ES: {len(es_posts)}, EN: {len(en_posts)}')

    print('\nMatching ES/EN pairs by published_at...')
    pairs, unpaired_es, unpaired_en = match_pairs(es_posts, en_posts)
    print(f'  Paired: {len(pairs)}')
    print(f'  Unpaired ES: {len(unpaired_es)}')
    print(f'  Unpaired EN: {len(unpaired_en)}')

    if dry_run:
        print('\n--- Paired posts (first 20) ---')
        for es_p, en_p in pairs[:20]:
            es_ts = parse_ts(es_p.get('published_at', ''))
            en_ts = parse_ts(en_p.get('published_at', ''))
            delta = abs(es_ts - en_ts) if es_ts and en_ts else 0
            delta_str = f'{int(delta)}s' if delta < 3600 else f'{delta/3600:.1f}h'
            print(f'  [{delta_str}] {es_p["slug"]}  <->  {en_p["slug"]}')
        if len(pairs) > 20:
            print(f'  ... and {len(pairs) - 20} more pairs')

        # Show pairs with delta > 120s (potential mismatches)
        suspect = []
        for es_p, en_p in pairs:
            es_ts = parse_ts(es_p.get('published_at', ''))
            en_ts = parse_ts(en_p.get('published_at', ''))
            delta = abs(es_ts - en_ts) if es_ts and en_ts else 0
            if delta > 120:
                suspect.append((delta, es_p['slug'], en_p['slug']))
        if suspect:
            suspect.sort(key=lambda x: x[0], reverse=True)
            print(f'\n--- Suspect pairs (delta > 120s) ---')
            for delta, es_slug, en_slug in suspect:
                delta_str = f'{int(delta)}s' if delta < 3600 else f'{delta/3600:.1f}h'
                print(f'  [{delta_str}] {es_slug}  <->  {en_slug}')
        if unpaired_es:
            print(f'\n--- Unpaired ES (first 10) ---')
            for p in unpaired_es[:10]:
                print(f'  {p["slug"]} ({p.get("published_at", "?")})')
        if unpaired_en:
            print(f'\n--- Unpaired EN (first 10) ---')
            for p in unpaired_en[:10]:
                print(f'  {p["slug"]} ({p.get("published_at", "?")})')
        return

    # Generate sitemap
    print('\nGenerating hreflang sitemap...')
    xml = generate_sitemap(pairs, unpaired_es, unpaired_en)
    os.makedirs(os.path.dirname(OUTPUT_PATH), exist_ok=True)
    with open(OUTPUT_PATH, 'w', encoding='utf-8') as f:
        f.write(xml)
    print(f'  Written to {OUTPUT_PATH}')
    print(f'  Total URLs: {len(pairs)*2 + len(unpaired_es) + len(unpaired_en) + 2}')

    # Inject meta tags
    if inject_meta:
        inject_meta_tags(pairs)

    # Deploy
    if deploy:
        upload_and_activate()

    print('\nDone!')


if __name__ == '__main__':
    main()
