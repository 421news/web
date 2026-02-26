#!/usr/bin/env python3
"""
Bulk-updates internal links in 421.news posts from /{slug}/ to /es/{slug}/.
Only modifies links pointing to www.421.news that are NOT /en/ paths.

Usage:
  python3 scripts/bulk-update-internal-links.py --dry-run    # Preview changes
  python3 scripts/bulk-update-internal-links.py --apply      # Apply changes
  python3 scripts/bulk-update-internal-links.py --dry-run --limit 10  # Preview first 10
"""

import json
import re
import sys
import time
import urllib.request
import hmac
import hashlib
import base64
import os
import copy

# --- Config ---
ADMIN_KEY = os.environ.get('GHOST_ADMIN_API_KEY', '')
GHOST_HOST = '421bn.ghost.io'
SITE_URL = 'https://www.421.news'

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
BACKUP_DIR = os.path.join(SCRIPT_DIR, '..', 'backups')

# Regex to match internal links that need updating:
# https://www.421.news/{slug}/ where slug is NOT en/ or es/ or ghost/ etc.
# Also matches relative links like /{slug}/
ABSOLUTE_PATTERN = re.compile(
    r'https://www\.421\.news/(?!es/|en/|ghost/|assets/|content/|members/|public/|rss/|tag/|author/|sitemap|robots|favicon|gracias/|oh-yes/)([a-z0-9][-a-z0-9]*/)'
)
RELATIVE_PATTERN = re.compile(
    r'(?<=["\'])(?:/)(?!es/|en/|ghost/|assets/|content/|members/|public/|rss/|tag/|author/|sitemap|robots|favicon|gracias/|oh-yes/)([a-z0-9][-a-z0-9]*/)(?=["\'])'
)


# --- JWT Auth ---
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


# --- Fetch all posts via Admin API (need lexical content) ---
def fetch_all_posts():
    all_posts = []
    page = 1
    while True:
        url = f'/ghost/api/admin/posts/?page={page}&limit=100&formats=lexical'
        print(f'  Fetching page {page}...')
        data = api_get(url)
        if 'posts' not in data:
            print(f'  Error: {json.dumps(data)[:200]}')
            break
        all_posts.extend(data['posts'])
        if not data['meta']['pagination'].get('next'):
            break
        page += 1
    return all_posts


def update_lexical_links(lexical_str):
    """Update internal links in Lexical JSON content.
    Returns (updated_str, count_of_changes)."""
    if not lexical_str:
        return lexical_str, 0

    changes = 0
    updated = lexical_str

    # Update absolute URLs: https://www.421.news/{slug}/ -> https://www.421.news/es/{slug}/
    def replace_absolute(match):
        nonlocal changes
        slug_with_slash = match.group(1)
        changes += 1
        return f'https://www.421.news/es/{slug_with_slash}'

    updated = ABSOLUTE_PATTERN.sub(replace_absolute, updated)

    return updated, changes


def update_html_links(html_str):
    """Update internal links in HTML content nodes.
    Returns (updated_str, count_of_changes)."""
    if not html_str:
        return html_str, 0

    changes = 0
    updated = html_str

    def replace_absolute(match):
        nonlocal changes
        slug_with_slash = match.group(1)
        changes += 1
        return f'https://www.421.news/es/{slug_with_slash}'

    updated = ABSOLUTE_PATTERN.sub(replace_absolute, updated)

    return updated, changes


def process_post(post, dry_run=True):
    """Process a single post, updating internal links.
    Returns (modified, total_changes, details)."""
    lexical = post.get('lexical', '')
    if not lexical:
        return False, 0, []

    updated_lexical, changes = update_lexical_links(lexical)

    if changes == 0:
        return False, 0, []

    details = [f'{changes} links updated']

    if not dry_run:
        try:
            # Re-fetch to get current updated_at
            current = api_get(f'/ghost/api/admin/posts/{post["id"]}/?formats=lexical')
            current_post = current['posts'][0]
            updated_at = current_post['updated_at']

            api_put(
                f'/ghost/api/admin/posts/{post["id"]}/',
                {'posts': [{'lexical': updated_lexical, 'updated_at': updated_at}]}
            )
        except Exception as e:
            return False, 0, [f'Error: {e}']

    return True, changes, details


def main():
    args = set(sys.argv[1:])
    dry_run = '--dry-run' in args
    apply = '--apply' in args
    limit = None

    for arg in sys.argv[1:]:
        if arg.startswith('--limit'):
            idx = sys.argv.index(arg)
            if idx + 1 < len(sys.argv):
                limit = int(sys.argv[idx + 1])

    if not dry_run and not apply:
        print('Usage: --dry-run to preview, --apply to execute')
        sys.exit(1)

    if apply:
        dry_run = False

    print('Fetching all posts via Admin API...')
    posts = fetch_all_posts()
    print(f'  Total: {len(posts)} posts')

    if apply:
        # Create backup
        os.makedirs(BACKUP_DIR, exist_ok=True)
        backup_path = os.path.join(BACKUP_DIR, f'lexical-backup-migration-{int(time.time())}.json')
        backup_data = []
        for p in posts:
            if p.get('lexical'):
                backup_data.append({
                    'id': p['id'],
                    'slug': p.get('slug', ''),
                    'lexical': p['lexical']
                })
        with open(backup_path, 'w') as f:
            json.dump(backup_data, f)
        print(f'  Backup saved: {backup_path}')

    total_modified = 0
    total_changes = 0
    processed = 0

    for post in posts:
        if limit and processed >= limit:
            break

        modified, changes, details = process_post(post, dry_run=dry_run)
        if modified:
            total_modified += 1
            total_changes += changes
            action = 'Would update' if dry_run else 'Updated'
            print(f'  {action}: {post.get("slug", post["id"])} ({", ".join(details)})')

        processed += 1
        if processed % 100 == 0:
            print(f'  Processed {processed}/{len(posts)}...')

    mode = 'DRY RUN' if dry_run else 'APPLIED'
    print(f'\n{mode}: {total_modified} posts with {total_changes} links updated')


if __name__ == '__main__':
    main()
