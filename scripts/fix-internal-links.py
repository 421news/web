#!/usr/bin/env python3
"""
Fixes old-format internal links in 421.news posts.
Replaces https://www.421.news/slug/ with https://www.421.news/es/slug/ or /en/slug/
based on the post's actual language tag.

This fixes the "not indexed due to redirect" issue in GSC — Google follows
these old URLs, gets a 301, and reports them as redirect pages.

Usage:
  python3 scripts/fix-internal-links.py --dry-run        # Preview changes
  python3 scripts/fix-internal-links.py --apply           # Apply changes
  python3 scripts/fix-internal-links.py --dry-run --limit 5  # Preview first 5
"""

import json
import re
import sys
import time
import urllib.request
import hashlib
import hmac
import base64
import os

# --- Config ---
ADMIN_KEY = os.environ.get('GHOST_ADMIN_API_KEY', '680be497f896280001455172:50f2d88ff42197eb96adf838b5c4b4baccc3ff6ff2e7772390b16ca4bcc6d967')
CONTENT_KEY = '420da6f85b5cc903b347de9e33'
GHOST_HOST = '421bn.ghost.io'
SITE_URL = 'https://www.421.news'

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
BACKUP_DIR = os.path.join(SCRIPT_DIR, '..', 'backups')

# Language prefixes used in routes
LANG_PREFIXES = {'es', 'en', 'zh', 'ja', 'ko', 'tr', 'pt', 'fr'}

# System paths that are NOT post slugs (excluded from catch-all redirect)
SYSTEM_PATHS = {
    'ghost', 'assets', 'content', 'members', 'public', 'rss',
    'sitemap', 'robots', 'favicon', 'author', 'tag',
}


# --- JWT Auth (from interlink-posts.py) ---
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


def api_get(path):
    token = make_jwt()
    req = urllib.request.Request(
        f'https://{GHOST_HOST}{path}',
        headers={'Authorization': f'Ghost {token}'}
    )
    with urllib.request.urlopen(req) as resp:
        return json.loads(resp.read())


def api_put(path, data):
    token = make_jwt()
    body = json.dumps(data).encode()
    req = urllib.request.Request(
        f'https://{GHOST_HOST}{path}',
        data=body,
        method='PUT',
        headers={
            'Authorization': f'Ghost {token}',
            'Content-Type': 'application/json'
        }
    )
    with urllib.request.urlopen(req) as resp:
        return json.loads(resp.read())


# --- Build slug → correct URL map ---
def build_slug_map():
    """Fetch all posts via Content API and build slug → correct URL map.
    Returns:
      slug_map: slug → {es: url, en: url} for posts that exist in both langs
                slug → {lang: url} for single-lang posts
      Also builds a flat lookup for ES and EN slugs.
    """
    slug_map = {}       # slug → {url, lang} for every post
    es_slugs = {}       # ES slug → /es/slug/ URL
    en_slugs = {}       # EN slug → /en/slug/ URL
    es_to_en_slug = {}  # ES slug → EN slug (from english-version meta)

    page = 1
    while True:
        url = (f'https://{GHOST_HOST}/ghost/api/content/posts/'
               f'?key={CONTENT_KEY}&limit=100&page={page}'
               f'&fields=slug,url,codeinjection_head&include=tags')
        with urllib.request.urlopen(url) as resp:
            data = json.loads(resp.read())

        for p in data['posts']:
            # Determine language from tags
            tag_slugs = [t['slug'] for t in p.get('tags', [])]
            lang = 'es'  # default
            for t in tag_slugs:
                if t == 'hash-en':
                    lang = 'en'
                    break
                elif t.startswith('hash-') and t.replace('hash-', '') in LANG_PREFIXES:
                    lang = t.replace('hash-', '')
                    break

            correct_url = f'{SITE_URL}/{lang}/{p["slug"]}/'
            slug_map[p['slug']] = {'url': correct_url, 'lang': lang}

            if lang == 'es':
                es_slugs[p['slug']] = correct_url
                # Extract english-version from codeinjection_head
                head = p.get('codeinjection_head') or ''
                m = re.search(r'name="english-version"\s+content="([^"]+)"', head)
                if m:
                    es_to_en_slug[p['slug']] = m.group(1)
            elif lang == 'en':
                en_slugs[p['slug']] = correct_url

        if page >= data['meta']['pagination']['pages']:
            break
        page += 1

    # Build ES slug → EN URL map (for intl posts linking to ES slugs)
    # An old link like 421.news/soberania-cognitiva/ in a ZH post should
    # resolve to /en/cognitive-sovereignty-.../ instead of /es/soberania-cognitiva/
    es_to_en_url = {}
    for es_slug, en_slug in es_to_en_slug.items():
        if en_slug in en_slugs:
            es_to_en_url[es_slug] = en_slugs[en_slug]

    # Also map ES pages to their EN equivalents for intl posts
    PAGE_ES_TO_EN = {
        'suscribite':   f'{SITE_URL}/en/subscribe/',
        'rutas':        f'{SITE_URL}/en/routes/',
        'canon':        f'{SITE_URL}/en/canon/',
        'que-es-421':   f'{SITE_URL}/en/what-is-421/',
        'revista-421':  f'{SITE_URL}/es/revista-421/',  # no EN equivalent, keep ES
    }
    for es_page, en_url in PAGE_ES_TO_EN.items():
        es_to_en_url[es_page] = en_url

    print(f"  ES→EN translation pairs: {len(es_to_en_url)}")

    # Page slug → correct public URL (Ghost returns root URLs, but routes.yaml maps them)
    # These are the actual public URLs based on routes.yaml custom routes
    PAGE_URL_MAP = {
        'suscribite':       f'{SITE_URL}/es/suscribite/',
        'subscribe':        f'{SITE_URL}/en/subscribe/',
        'rutas':            f'{SITE_URL}/es/rutas/',
        'routes':           f'{SITE_URL}/en/routes/',
        'canon':            f'{SITE_URL}/es/canon/',
        'canon-en':         f'{SITE_URL}/en/canon/',
        'revista-421':      f'{SITE_URL}/es/revista-421/',
        'que-es-421':       f'{SITE_URL}/es/que-es-421/',
        'what-is-421':      f'{SITE_URL}/en/what-is-421/',
        'pitcheale-a-421':  f'{SITE_URL}/es/pitcheale-a-421/',
        'mi-suscripcion':   f'{SITE_URL}/es/mi-suscripcion/',
        'my-subscription':  f'{SITE_URL}/en/my-subscription/',
        'ultimos-posts':    f'{SITE_URL}/es/ultimos-posts/',
        'last-posts':       f'{SITE_URL}/en/last-posts/',
        'analytics':        f'{SITE_URL}/es/analytics/',
        'tecnomagia-para-la-vida-real': f'{SITE_URL}/es/tecnomagia-para-la-vida-real/',
        # These stay at root (excluded from catch-all in redirects.yaml)
        'gracias':          f'{SITE_URL}/gracias/',
        'oh-yes':           f'{SITE_URL}/oh-yes/',
    }

    for page_slug, correct_url in PAGE_URL_MAP.items():
        lang = 'en' if '/en/' in correct_url else 'es'
        slug_map[page_slug] = {'url': correct_url, 'lang': lang}

    return slug_map, es_to_en_url


# --- Fetch all posts via Admin API ---
def fetch_all_posts():
    all_posts = []
    page = 1
    while True:
        print(f'  Fetching page {page}...')
        data = api_get(
            f'/ghost/api/admin/posts/?page={page}&limit=100'
            f'&formats=lexical&fields=id,slug,title,lexical,updated_at,url'
            f'&include=tags'
        )
        if 'posts' not in data:
            print(f'  Error: {json.dumps(data)[:200]}')
            break
        all_posts.extend(data['posts'])
        if not data['meta']['pagination'].get('next'):
            break
        page += 1
    return all_posts


# --- Lexical link fixer ---
def is_old_format_url(url):
    """Check if a URL is an old-format 421.news link (no language prefix)."""
    match = re.match(
        r'https?://(?:www\.)?421\.news/([^/]+)/?$', url
    )
    if not match:
        return False
    first_segment = match.group(1)
    # Not old format if it already has a language prefix
    if first_segment in LANG_PREFIXES:
        return False
    # Not old format if it's a system path
    if first_segment in SYSTEM_PATHS:
        return False
    return True


def extract_slug_from_old_url(url):
    """Extract the slug from an old-format URL."""
    match = re.match(
        r'https?://(?:www\.)?421\.news/([^/]+)/?$', url
    )
    return match.group(1) if match else None


def resolve_url(slug, post_lang, slug_map, es_to_en_url):
    """Resolve the correct URL for a slug based on the linking post's language.

    Rules:
    - ES post linking to ES slug → /es/slug/
    - EN post linking to EN slug → /en/slug/
    - Intl post (pt/fr/zh/ja/ko/tr) linking to an ES slug:
        - If EN translation exists → /en/en-slug/ (preferred for intl audiences)
        - Else → /es/slug/ (fallback)
    - Any post linking to any slug → use that slug's own language URL
    """
    if slug not in slug_map:
        return None

    info = slug_map[slug]
    target_lang = info['lang']
    target_url = info['url']

    # If the linking post is EN or intl AND the target is ES, prefer EN version
    if post_lang != 'es' and target_lang == 'es':
        if slug in es_to_en_url:
            return es_to_en_url[slug]

    return target_url


def fix_links_in_lexical(lexical, post_lang, slug_map, es_to_en_url):
    """Walk lexical tree and fix old-format internal links.
    Returns list of fixes applied."""
    fixes = []

    def walk(node):
        if isinstance(node, dict):
            if node.get('type') == 'link':
                url = node.get('url', '')
                if is_old_format_url(url):
                    slug = extract_slug_from_old_url(url)
                    if slug:
                        new_url = resolve_url(slug, post_lang, slug_map, es_to_en_url)
                        if new_url:
                            fixes.append({
                                'old_url': url,
                                'new_url': new_url,
                                'slug': slug,
                            })
                            node['url'] = new_url
                        elif slug in slug_map:
                            # Slug exists but no resolution (shouldn't happen)
                            fixes.append({
                                'old_url': url,
                                'new_url': slug_map[slug]['url'],
                                'slug': slug,
                            })
                            node['url'] = slug_map[slug]['url']
                        else:
                            fixes.append({
                                'old_url': url,
                                'new_url': None,
                                'slug': slug,
                                'warning': 'slug not found in any published post',
                            })
            for child in node.get('children', []):
                walk(child)
            if 'root' in node:
                walk(node['root'])
        elif isinstance(node, list):
            for item in node:
                walk(item)

    walk(lexical)
    return fixes


# --- Also fix links in HTML cards inside lexical ---
def fix_html_in_lexical(lexical, post_lang, slug_map, es_to_en_url):
    """Fix old-format URLs inside HTML card nodes in lexical content."""
    fixes = []

    def walk(node):
        if isinstance(node, dict):
            # HTML cards store content in 'html' field
            if node.get('type') == 'html' and 'html' in node:
                html = node['html']
                new_html = html

                # Find all old-format 421.news URLs in href attributes
                pattern = r'href="(https?://(?:www\.)?421\.news/([^"/]+)/?)"'
                for match in re.finditer(pattern, html):
                    full_url = match.group(1)
                    slug = match.group(2)
                    if slug in LANG_PREFIXES or slug in SYSTEM_PATHS:
                        continue
                    new_url = resolve_url(slug, post_lang, slug_map, es_to_en_url)
                    if new_url:
                        new_html = new_html.replace(full_url, new_url)
                        fixes.append({
                            'old_url': full_url,
                            'new_url': new_url,
                            'slug': slug,
                            'source': 'html-card',
                        })

                if new_html != html:
                    node['html'] = new_html

            for child in node.get('children', []):
                walk(child)
            if 'root' in node:
                walk(node['root'])
        elif isinstance(node, list):
            for item in node:
                walk(item)

    walk(lexical)
    return fixes


def main():
    dry_run = '--dry-run' in sys.argv or '--apply' not in sys.argv
    limit = None
    for i, arg in enumerate(sys.argv):
        if arg == '--limit' and i + 1 < len(sys.argv):
            limit = int(sys.argv[i + 1])

    mode = "DRY RUN" if dry_run else "APPLYING CHANGES"
    print(f"=== 421 Fix Internal Links ({mode}) ===\n")

    # Step 1: Build slug → correct URL map
    print("Building slug → URL map from Content API...")
    slug_map, es_to_en_url = build_slug_map()
    print(f"  {len(slug_map)} slugs mapped\n")

    # Step 2: Fetch all posts
    print("Fetching all posts via Admin API...")
    posts = fetch_all_posts()
    print(f"  {len(posts)} posts fetched\n")

    # Step 3: Scan and fix
    print("Scanning for old-format internal links...\n")

    all_results = []
    total_fixes = 0
    total_warnings = 0
    total_intl_to_en = 0
    posts_with_fixes = 0

    for post in posts:
        if not post.get('lexical'):
            continue
        try:
            lexical = json.loads(post['lexical'])
        except (json.JSONDecodeError, TypeError):
            continue

        # Determine this post's language
        tag_slugs = [t['slug'] for t in post.get('tags', [])]
        post_lang = 'es'
        for t in tag_slugs:
            if t == 'hash-en':
                post_lang = 'en'
                break
            elif t.startswith('hash-') and t.replace('hash-', '') in LANG_PREFIXES:
                post_lang = t.replace('hash-', '')
                break

        # Fix link nodes
        link_fixes = fix_links_in_lexical(lexical, post_lang, slug_map, es_to_en_url)
        # Fix HTML cards
        html_fixes = fix_html_in_lexical(lexical, post_lang, slug_map, es_to_en_url)

        all_fixes = link_fixes + html_fixes
        actual_fixes = [f for f in all_fixes if f.get('new_url')]
        warnings = [f for f in all_fixes if not f.get('new_url')]

        if actual_fixes:
            # Count intl→EN redirections
            intl_en = sum(1 for f in actual_fixes
                          if post_lang in ('pt', 'fr', 'zh', 'ja', 'ko', 'tr')
                          and f['new_url'] and '/en/' in f['new_url'])

            all_results.append({
                'post_id': post['id'],
                'post_slug': post['slug'],
                'post_title': post['title'],
                'post_lang': post_lang,
                'post_updated_at': post['updated_at'],
                'lexical_fixed': json.dumps(lexical),
                'fixes': actual_fixes,
                'warnings': warnings,
            })
            total_fixes += len(actual_fixes)
            total_warnings += len(warnings)
            total_intl_to_en += intl_en
            posts_with_fixes += 1

    print(f"Found {total_fixes} links to fix in {posts_with_fixes} posts")
    if total_intl_to_en:
        print(f"  ({total_intl_to_en} intl links redirected to /en/ instead of /es/)")
    if total_warnings:
        print(f"  ({total_warnings} links with unresolved slugs)")
    print()

    if limit:
        all_results = all_results[:limit]
        print(f"  (Limited to {limit} posts)\n")

    # Step 4: Show or apply
    if dry_run:
        for result in all_results:
            lang_tag = f" [{result['post_lang']}]" if result['post_lang'] != 'es' else ""
            print(f"  POST: \"{result['post_title']}\" ({result['post_slug']}){lang_tag}")
            for fix in result['fixes']:
                src = f" [{fix.get('source')}]" if fix.get('source') else ""
                print(f"    {fix['old_url']}")
                print(f"    → {fix['new_url']}{src}")
            for warn in result.get('warnings', []):
                print(f"    ⚠ {warn['old_url']} — {warn.get('warning', '?')}")
            print()
    else:
        # Backup before applying
        os.makedirs(BACKUP_DIR, exist_ok=True)
        backup_file = os.path.join(BACKUP_DIR, f'fix-links-backup-{int(time.time())}.json')
        backup_data = {}
        for r in all_results:
            # Fetch fresh lexical for backup (the one we parsed was already modified in-memory)
            backup_data[r['post_slug']] = {
                'post_id': r['post_id'],
                'fixes': r['fixes'],
            }
        with open(backup_file, 'w') as f:
            json.dump(backup_data, f, indent=2)
        print(f"  Backup saved to {backup_file}\n")

        applied = 0
        failed = 0
        for result in all_results:
            # Re-fetch post to get fresh updated_at (optimistic locking)
            try:
                fresh = api_get(f"/ghost/api/admin/posts/{result['post_id']}/?formats=lexical")
                fresh_post = fresh['posts'][0]
                fresh_lexical = json.loads(fresh_post['lexical'])

                # Re-apply fixes to fresh lexical
                post_lang = result['post_lang']
                fix_links_in_lexical(fresh_lexical, post_lang, slug_map, es_to_en_url)
                fix_html_in_lexical(fresh_lexical, post_lang, slug_map, es_to_en_url)

                resp = api_put(
                    f"/ghost/api/admin/posts/{result['post_id']}/",
                    {"posts": [{
                        "lexical": json.dumps(fresh_lexical),
                        "updated_at": fresh_post['updated_at'],
                    }]}
                )
                if resp.get('posts'):
                    n = len(result['fixes'])
                    print(f"  OK: \"{result['post_title']}\" — {n} links fixed")
                    applied += 1
                else:
                    print(f"  ERROR: {result['post_slug']}: {json.dumps(resp)[:200]}")
                    failed += 1
            except Exception as e:
                print(f"  ERROR: {result['post_slug']}: {e}")
                failed += 1

            time.sleep(0.3)  # Rate limit

        print(f"\n  Applied: {applied} posts, Failed: {failed}")

    # Summary
    print(f"\n{'Would fix' if dry_run else 'Fixed'} {total_fixes} links in {posts_with_fixes} posts")
    if dry_run:
        print(f"\nTo apply: python3 {sys.argv[0]} --apply")


if __name__ == '__main__':
    main()
