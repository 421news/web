#!/usr/bin/env python3
"""
Bulk set OG/Twitter fields for all 421.news tags.
Copies meta_title → og_title + twitter_title, description → og_description + twitter_description.
Sets og_image and twitter_image to the default OG image.
Also sets meta_title + description for 9 EN tags that are missing them.

Usage:
  python3 scripts/fix-tag-seo.py --dry-run    # Preview changes
  python3 scripts/fix-tag-seo.py --apply       # Apply changes
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
OG_IMAGE = 'https://www.421.news/content/images/2024/09/GXnmmH3WgAABx7l-1.jpg'

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
BACKUP_DIR = os.path.join(SCRIPT_DIR, '..', 'backups')

# EN tags that need meta_title + description created (not just OG copied)
EN_TAG_METADATA = {
    'books': {
        'meta_title': 'Books: reviews & recommendations | 421',
        'description': 'Book reviews, literary essays, and reading recommendations. Fiction and non-fiction through a critical lens.',
    },
    'comics': {
        'meta_title': 'Comics: graphic novels & manga | 421',
        'description': 'Comics, manga, graphic novels, and sequential art. Reviews and analysis from the world of panels.',
    },
    'crypto': {
        'meta_title': 'Crypto: blockchain & digital currencies | 421',
        'description': 'Cryptocurrency, blockchain, and decentralized finance explained without the hype. Critical analysis of the crypto ecosystem.',
    },
    'movies': {
        'meta_title': 'Movies: film criticism & analysis | 421',
        'description': 'Film criticism, analysis, and essays. Movies that matter, explained in depth.',
    },
    'philosophy': {
        'meta_title': 'Philosophy: ideas for real life | 421',
        'description': 'Applied philosophy for everyday life. Classical and contemporary thinkers outside the academy.',
    },
    'sovereignty': {
        'meta_title': 'Sovereignty: digital & tech independence | 421',
        'description': 'Digital sovereignty and tech independence. Articles on autonomy, privacy, and data control.',
    },
    'the-canon': {
        'meta_title': 'The Canon: 25 essential texts | 421',
        'description': 'The 25 essential texts from 421. An editorial selection with the reasons why each one matters.',
    },
    'tutorials': {
        'meta_title': 'Tutorials: step-by-step guides | 421',
        'description': 'Step-by-step guides: software setup, digital tools, and technical tricks. Do it yourself.',
    },
    'video-games': {
        'meta_title': 'Video Games: analysis & reviews | 421',
        'description': 'Video game analysis, reviews, and essays. The gaming industry through a cultural lens.',
    },
}


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


def main():
    dry_run = '--dry-run' in sys.argv or '--apply' not in sys.argv

    mode = "DRY RUN" if dry_run else "APPLYING CHANGES"
    print(f"=== 421 Tag SEO (OG/Twitter) Fix ({mode}) ===\n")

    print("Fetching all public tags...")
    data = api_get('/ghost/api/admin/tags/?limit=all&filter=visibility:public')
    tags = data.get('tags', [])
    print(f"  Total: {len(tags)} public tags\n")

    # Build updates
    to_update = []
    for tag in tags:
        slug = tag['slug']
        fields = {}

        # Step 1: For EN tags missing meta_title/description, set them
        if slug in EN_TAG_METADATA:
            en_data = EN_TAG_METADATA[slug]
            if not tag.get('meta_title'):
                fields['meta_title'] = en_data['meta_title']
            if not tag.get('description'):
                fields['description'] = en_data['description']

        # Step 2: Determine the source values for OG/Twitter
        meta_title = fields.get('meta_title') or tag.get('meta_title') or ''
        description = fields.get('description') or tag.get('description') or ''

        if not meta_title and not description:
            continue  # Skip tags without any metadata

        # Step 3: Set OG/Twitter fields
        if meta_title and tag.get('og_title') != meta_title:
            fields['og_title'] = meta_title
        if description and tag.get('og_description') != description:
            fields['og_description'] = description
        if tag.get('og_image') != OG_IMAGE:
            fields['og_image'] = OG_IMAGE
        if meta_title and tag.get('twitter_title') != meta_title:
            fields['twitter_title'] = meta_title
        if description and tag.get('twitter_description') != description:
            fields['twitter_description'] = description
        if tag.get('twitter_image') != OG_IMAGE:
            fields['twitter_image'] = OG_IMAGE

        if fields:
            to_update.append({
                'tag': tag,
                'fields': fields,
            })

    print(f"Tags needing updates: {len(to_update)}\n")

    if not to_update:
        print("Nothing to fix!")
        return

    # Show preview
    for item in sorted(to_update, key=lambda x: x['tag']['slug']):
        slug = item['tag']['slug']
        print(f"  [{slug}]")
        for key, val in item['fields'].items():
            display = val if len(val) <= 60 else val[:60] + '...'
            print(f"    {key}: \"{display}\"")
        print()

    if dry_run:
        print(f"To apply, run: python3 {sys.argv[0]} --apply")
        return

    # Create backup
    os.makedirs(BACKUP_DIR, exist_ok=True)
    backup_file = os.path.join(BACKUP_DIR, f'tag-seo-backup-{int(time.time())}.json')
    backup_data = {}
    for item in to_update:
        tag = item['tag']
        backup_data[tag['slug']] = {
            'og_title': tag.get('og_title') or '',
            'og_description': tag.get('og_description') or '',
            'og_image': tag.get('og_image') or '',
            'twitter_title': tag.get('twitter_title') or '',
            'twitter_description': tag.get('twitter_description') or '',
            'twitter_image': tag.get('twitter_image') or '',
            'meta_title': tag.get('meta_title') or '',
            'description': tag.get('description') or '',
        }
    with open(backup_file, 'w') as f:
        json.dump(backup_data, f, ensure_ascii=False, indent=2)
    print(f"Backup saved to {backup_file}\n")

    # Apply
    success = 0
    errors = 0
    for item in to_update:
        tag = item['tag']
        payload = dict(item['fields'])
        payload['updated_at'] = tag['updated_at']

        try:
            resp = api_put(
                f"/ghost/api/admin/tags/{tag['id']}/",
                {"tags": [payload]}
            )
            if resp.get('tags'):
                success += 1
                print(f"  OK: {tag['slug']}")
            else:
                errors += 1
                print(f"  ERROR on {tag['slug']}: {json.dumps(resp)[:200]}")
        except Exception as e:
            errors += 1
            print(f"  ERROR on {tag['slug']}: {e}")

        time.sleep(0.5)

    print(f"\nDone! Updated: {success}, Errors: {errors}")


if __name__ == '__main__':
    main()
