#!/usr/bin/env python3
"""
Bulk fix feature_image_alt for 421.news posts.
Sets feature_image_alt to the post title for all posts that have a
feature_image but no alt text.

Usage:
  python3 scripts/fix-feature-image-alt.py --dry-run    # Preview changes
  python3 scripts/fix-feature-image-alt.py --apply       # Apply changes
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
ADMIN_KEY = os.environ.get('GHOST_ADMIN_API_KEY', '')
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
            f'&fields=id,slug,title,feature_image,feature_image_alt,updated_at'
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
    print(f"=== 421 Feature Image Alt Fix ({mode}) ===\n")

    print("Fetching all posts...")
    posts = fetch_all_posts()
    print(f"  Total: {len(posts)} posts\n")

    # Filter: has feature_image but no feature_image_alt
    to_fix = [
        p for p in posts
        if p.get('feature_image') and not p.get('feature_image_alt')
    ]

    print(f"Posts with feature_image but no alt text: {len(to_fix)} / {len(posts)}\n")

    if not to_fix:
        print("Nothing to fix!")
        return

    # Show sample
    print("Sample (first 10):")
    for p in to_fix[:10]:
        print(f"  [{p['slug']}] alt will be: \"{p['title']}\"")
    if len(to_fix) > 10:
        print(f"  ... and {len(to_fix) - 10} more\n")
    else:
        print()

    if dry_run:
        print(f"To apply, run: python3 {sys.argv[0]} --apply")
        return

    # Create backup
    os.makedirs(BACKUP_DIR, exist_ok=True)
    backup_file = os.path.join(BACKUP_DIR, f'feature-image-alt-backup-{int(time.time())}.json')
    backup_data = {
        p['slug']: {
            'feature_image_alt': p.get('feature_image_alt') or '',
            'title': p['title'],
        }
        for p in to_fix
    }
    with open(backup_file, 'w') as f:
        json.dump(backup_data, f, ensure_ascii=False, indent=2)
    print(f"Backup saved to {backup_file}\n")

    # Apply updates
    success = 0
    errors = 0
    for i, post in enumerate(to_fix):
        try:
            resp = api_put(
                f"/ghost/api/admin/posts/{post['id']}/",
                {"posts": [{
                    "feature_image_alt": post['title'],
                    "updated_at": post['updated_at'],
                }]}
            )
            if resp.get('posts'):
                success += 1
                if success % 50 == 0:
                    print(f"  Progress: {success}/{len(to_fix)} updated...")
            else:
                errors += 1
                print(f"  ERROR on {post['slug']}: {json.dumps(resp)[:200]}")
        except Exception as e:
            errors += 1
            print(f"  ERROR on {post['slug']}: {e}")

        time.sleep(0.5)

    print(f"\nDone! Updated: {success}, Errors: {errors}")


if __name__ == '__main__':
    main()
