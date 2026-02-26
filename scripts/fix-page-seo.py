#!/usr/bin/env python3
"""
Create/update Ghost Pages for SEO metadata on custom routes.
These pages serve as data sources for routes.yaml `data: page.{slug}` binding,
so Ghost's {{meta_title}} and {{meta_description}} work on custom routes.

Usage:
  python3 scripts/fix-page-seo.py --dry-run    # Preview changes
  python3 scripts/fix-page-seo.py --apply       # Apply changes
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

# Minimal empty Lexical document
EMPTY_LEXICAL = '{"root":{"children":[{"children":[],"direction":null,"format":"","indent":0,"type":"paragraph","version":1}],"direction":null,"format":"","indent":0,"type":"root","version":1}}'

# Pages to create/update
PAGES = [
    # Public routes (10)
    {
        'slug': 'rutas',
        'title': 'Rutas de lectura',
        'meta_title': 'Rutas de lectura | 421',
        'meta_description': '7 caminos curados para explorar 350+ textos. Cada ruta es un recorrido temático por lo mejor de 421.',
    },
    {
        'slug': 'canon',
        'title': 'Canon 421',
        'meta_title': 'Canon 421 | 421',
        'meta_description': 'Los 25 textos esenciales de 421. Si fuera una biblioteca, estos serían los libros que no pueden faltar.',
    },
    {
        'slug': 'routes',
        'title': 'Reading Paths',
        'meta_title': 'Reading Paths | 421',
        'meta_description': '7 curated paths to explore 350+ texts. Each route is a thematic journey through the best of 421.',
    },
    {
        'slug': 'canon-en',
        'title': 'Canon 421 (EN)',
        'meta_title': 'Canon 421 | 421',
        'meta_description': 'The 25 essential texts from 421. If it were a library, these would be the must-read books.',
    },
    {
        'slug': 'suscribite',
        'title': 'Suscribite a 421',
        'meta_title': 'Suscribite a 421 | 421',
        'meta_description': '421 es un medio de orientación intelectual. Suscribite para acceder a todo el contenido.',
    },
    {
        'slug': 'subscribe',
        'title': 'Subscribe to 421',
        'meta_title': 'Subscribe to 421 | 421',
        'meta_description': '421 is an intellectual orientation outlet. Subscribe for full access to all content.',
    },
    {
        'slug': 'revista-421',
        'title': 'Revista 421',
        'meta_title': 'Revista 421 | 421',
        'meta_description': 'La revista digital de 421. Todos los números disponibles para leer online.',
    },
    {
        'slug': 'pitcheale-a-421',
        'title': 'Pitcheale a 421',
        'meta_title': 'Pitcheale a 421 | 421',
        'meta_description': '¿Tenés una idea que querés compartir? Proponela para publicar en 421.',
    },
    {
        'slug': 'ultimos-posts',
        'title': 'Últimas notas',
        'meta_title': 'Últimas notas | 421',
        'meta_description': 'El archivo completo de notas de 421. Filtrá por autor, tema o fecha.',
    },
    {
        'slug': 'last-posts',
        'title': 'Last posts',
        'meta_title': 'Last posts | 421',
        'meta_description': 'The complete archive of 421 posts. Filter by author, topic, or date.',
    },
    # Noindex routes (4) — pages created for data binding (browser tab title)
    {
        'slug': 'mi-suscripcion',
        'title': 'Mi suscripción',
        'meta_title': 'Mi suscripción | 421',
        'meta_description': '',
    },
    {
        'slug': 'my-subscription',
        'title': 'My subscription',
        'meta_title': 'My subscription | 421',
        'meta_description': '',
    },
    {
        'slug': 'gracias',
        'title': 'Gracias',
        'meta_title': 'Gracias | 421',
        'meta_description': '',
    },
    {
        'slug': 'oh-yes',
        'title': 'Oh yes',
        'meta_title': 'Oh yes | 421',
        'meta_description': '',
    },
]


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


def api_post(path, data):
    token = make_jwt()
    body = json.dumps(data).encode()
    req = urllib.request.Request(
        f'https://{GHOST_HOST}{path}',
        data=body,
        method='POST',
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
    print(f"=== 421 Page SEO (Custom Route Metadata) ({mode}) ===\n")

    # Fetch all existing pages
    print("Fetching existing pages...")
    data = api_get('/ghost/api/admin/pages/?limit=all&fields=id,slug,title,meta_title,meta_description,status,updated_at')
    existing_pages = {p['slug']: p for p in data.get('pages', [])}
    print(f"  Found {len(existing_pages)} existing pages\n")

    to_create = []
    to_update = []

    for page_def in PAGES:
        slug = page_def['slug']
        existing = existing_pages.get(slug)

        if existing:
            # Check if update needed
            fields = {}
            if page_def.get('meta_title') and existing.get('meta_title') != page_def['meta_title']:
                fields['meta_title'] = page_def['meta_title']
            if page_def.get('meta_description') and existing.get('meta_description') != page_def['meta_description']:
                fields['meta_description'] = page_def['meta_description']

            if fields:
                to_update.append({
                    'existing': existing,
                    'fields': fields,
                    'slug': slug,
                })
            else:
                print(f"  [{slug}] Already up to date")
        else:
            to_create.append(page_def)

    print(f"\nPages to create: {len(to_create)}")
    print(f"Pages to update: {len(to_update)}\n")

    # Preview
    if to_create:
        print("Will CREATE:")
        for p in to_create:
            print(f"  [{p['slug']}] title=\"{p['title']}\" meta_title=\"{p.get('meta_title', '')}\"")
        print()

    if to_update:
        print("Will UPDATE:")
        for u in to_update:
            print(f"  [{u['slug']}] {list(u['fields'].keys())}")
        print()

    if not to_create and not to_update:
        print("Nothing to do!")
        return

    if dry_run:
        print(f"To apply, run: python3 {sys.argv[0]} --apply")
        return

    # Backup existing pages that will be updated
    if to_update:
        os.makedirs(BACKUP_DIR, exist_ok=True)
        backup_file = os.path.join(BACKUP_DIR, f'page-seo-backup-{int(time.time())}.json')
        backup_data = {}
        for u in to_update:
            p = u['existing']
            backup_data[p['slug']] = {
                'meta_title': p.get('meta_title') or '',
                'meta_description': p.get('meta_description') or '',
            }
        with open(backup_file, 'w') as f:
            json.dump(backup_data, f, ensure_ascii=False, indent=2)
        print(f"Backup saved to {backup_file}\n")

    success = 0
    errors = 0

    # Create new pages
    for page_def in to_create:
        page_body = {
            'title': page_def['title'],
            'slug': page_def['slug'],
            'status': 'published',
            'lexical': EMPTY_LEXICAL,
        }
        if page_def.get('meta_title'):
            page_body['meta_title'] = page_def['meta_title']
        if page_def.get('meta_description'):
            page_body['meta_description'] = page_def['meta_description']

        try:
            resp = api_post(
                '/ghost/api/admin/pages/',
                {"pages": [page_body]}
            )
            if resp.get('pages'):
                success += 1
                print(f"  CREATED: {page_def['slug']}")
            else:
                errors += 1
                print(f"  ERROR creating {page_def['slug']}: {json.dumps(resp)[:200]}")
        except Exception as e:
            errors += 1
            print(f"  ERROR creating {page_def['slug']}: {e}")

        time.sleep(0.5)

    # Update existing pages
    for u in to_update:
        payload = dict(u['fields'])
        payload['updated_at'] = u['existing']['updated_at']

        try:
            resp = api_put(
                f"/ghost/api/admin/pages/{u['existing']['id']}/",
                {"pages": [payload]}
            )
            if resp.get('pages'):
                success += 1
                print(f"  UPDATED: {u['slug']}")
            else:
                errors += 1
                print(f"  ERROR updating {u['slug']}: {json.dumps(resp)[:200]}")
        except Exception as e:
            errors += 1
            print(f"  ERROR updating {u['slug']}: {e}")

        time.sleep(0.5)

    print(f"\nDone! Success: {success}, Errors: {errors}")


if __name__ == '__main__':
    main()
