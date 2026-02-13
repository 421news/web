#!/usr/bin/env python3
"""
Bulk fill missing SEO fields for 421.news posts.
Sets meta_title, og_title, og_description, twitter_title, twitter_description
to sensible defaults (post title / excerpt) where missing.

Usage:
  python3 scripts/fix-post-seo-fields.py --dry-run    # Preview changes
  python3 scripts/fix-post-seo-fields.py --apply       # Apply changes
"""

import json
import sys
import time
import urllib.request
import hashlib
import hmac
import base64
import os

# --- Config ---
ADMIN_KEY = 'GHOST_ADMIN_API_KEY_REDACTED'
GHOST_HOST = '421bn.ghost.io'

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
BACKUP_DIR = os.path.join(SCRIPT_DIR, '..', 'backups')


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


# --- Fetch all posts ---
def fetch_all_posts():
    all_posts = []
    page = 1
    while True:
        print(f'  Fetching page {page}...')
        data = api_get(
            f'/ghost/api/admin/posts/?page={page}&limit=100'
            f'&fields=id,slug,title,meta_title,meta_description,custom_excerpt,'
            f'og_title,og_description,og_image,twitter_title,twitter_description,'
            f'twitter_image,feature_image,updated_at'
        )
        if 'posts' not in data:
            print(f'  Error: {json.dumps(data)[:200]}')
            break
        all_posts.extend(data['posts'])
        if not data['meta']['pagination'].get('next'):
            break
        page += 1
    return all_posts


def main():
    dry_run = '--dry-run' in sys.argv or '--apply' not in sys.argv

    mode = "DRY RUN" if dry_run else "APPLYING CHANGES"
    print(f"=== 421 Post SEO Fields Fix ({mode}) ===\n")

    print("Fetching all posts...")
    posts = fetch_all_posts()
    print(f"  Total: {len(posts)} posts\n")

    # Build updates for each post
    updates = []
    for post in posts:
        fields = {}
        title = post['title']
        desc = post.get('custom_excerpt') or post.get('meta_description') or ''

        # meta_title
        if not post.get('meta_title'):
            fields['meta_title'] = title

        # og fields
        if not post.get('og_title'):
            fields['og_title'] = title
        if not post.get('og_description') and desc:
            fields['og_description'] = desc

        # twitter fields
        if not post.get('twitter_title'):
            fields['twitter_title'] = title
        if not post.get('twitter_description') and desc:
            fields['twitter_description'] = desc

        if fields:
            updates.append({
                'id': post['id'],
                'slug': post['slug'],
                'title': title,
                'updated_at': post['updated_at'],
                'fields': fields,
            })

    print(f"Posts needing updates: {len(updates)}\n")

    if not updates:
        print("Nothing to fix!")
        return

    # Count by field
    counts = {}
    for u in updates:
        for f in u['fields']:
            counts[f] = counts.get(f, 0) + 1
    print("Fields to set:")
    for field, count in sorted(counts.items()):
        print(f"  {field}: {count}")
    print()

    # Sample
    print("Sample (first 5):")
    for u in updates[:5]:
        print(f"  [{u['slug']}] -> {list(u['fields'].keys())}")
    if len(updates) > 5:
        print(f"  ... and {len(updates) - 5} more\n")

    if dry_run:
        print(f"To apply, run: python3 {sys.argv[0]} --apply")
        return

    # Backup
    os.makedirs(BACKUP_DIR, exist_ok=True)
    backup_file = os.path.join(BACKUP_DIR, f'post-seo-fields-backup-{int(time.time())}.json')
    backup_data = {
        u['slug']: {f: '' for f in u['fields']}
        for u in updates
    }
    with open(backup_file, 'w') as f:
        json.dump(backup_data, f, ensure_ascii=False, indent=2)
    print(f"Backup saved to {backup_file}\n")

    # Apply
    success = 0
    errors = 0
    for i, u in enumerate(updates):
        payload = dict(u['fields'])
        payload['updated_at'] = u['updated_at']

        try:
            resp = api_put(
                f"/ghost/api/admin/posts/{u['id']}/",
                {"posts": [payload]}
            )
            if resp.get('posts'):
                success += 1
                if success % 50 == 0:
                    print(f"  Progress: {success}/{len(updates)}...")
            else:
                errors += 1
                print(f"  ERROR on {u['slug']}: {json.dumps(resp)[:200]}")
        except Exception as e:
            errors += 1
            print(f"  ERROR on {u['slug']}: {e}")

        time.sleep(0.5)

    print(f"\nDone! Updated: {success}, Errors: {errors}")


if __name__ == '__main__':
    main()
