#!/usr/bin/env python3
"""
Bulk fix author bios for 421.news.
Sets bio for authors that are missing one, based on their published posts.

Usage:
  python3 scripts/fix-author-bios.py --dry-run    # Preview changes
  python3 scripts/fix-author-bios.py --apply       # Apply changes
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

# --- Author bios ---
# Drafted from each author's published posts on 421.news
AUTHOR_BIOS = {
    'admin_421': 'Equipo editorial de 421.news.',

    'sole-zeta': 'Escritor y periodista de videojuegos. Colabora en 421, Press Over y Ponele.',

    'alejandra-morasano': 'Fotoperiodista (ARGRA). Fotógrafa en Página|12. Cubre festivales, cultura pop y objetos de culto.',

    'nataliatorres': 'Escribe sobre historia cultural y costumbres argentinas. Cronista de rituales cotidianos.',

    'zipigonzalez': 'Escribe sobre música, política y contracultura. El thrash metal como herramienta de análisis.',

    'cristobal-soto': 'Escritor chileno. Autor de El caso Las Dalias. Escribe sobre animación, ciencia ficción y nostalgia.',

    'paula-yeyati': 'Escritora y editora. Licenciada en Letras (UBA). Autora de Plegarias a un caballo de carrera vencido.',

    'sasha': 'Escribe sobre experiencias cotidianas y los diseños invisibles que nos rodean.',

    'juanbn': 'Músico, periodista y poeta. Fundó la editorial Trilce. Publicó el disco Sans Serif.',

    'rodrigo-illarraga': 'Investigador en CONICET y profesor de Teoría Política en la UBA. Doctor en Filosofía.',

    'maia': 'Periodista, escritora e ilustradora. Crítica de cine en Página|12. Autora de Cine en pijamas y ALF.',

    'victorianacucchio': 'Licenciada en Filosofía. Magíster (ITBA).',

    'pablowasserman': 'Co-conductor del podcast Círculo Vicioso. Piloto de drones FPV.',

    'investiganita': 'Investiga ovnis, operaciones encubiertas y misterios argentinos.',

    'fran-strambini': 'Estudió Ingeniería Informática en la UBA. Business Development en LambdaClass, el venture studio detrás de Aligned.',

    'lucas-de-paoli': 'Jugador y evangelista de Magic: The Gathering. Escribe sobre el juego de cartas coleccionables.',
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
    print(f"=== 421 Author Bios Fix ({mode}) ===\n")

    print("Fetching all users...")
    data = api_get('/ghost/api/admin/users/?limit=all&include=count.posts')
    users = data.get('users', [])
    print(f"  Total: {len(users)} users\n")

    # Filter users that need bios and have entries in AUTHOR_BIOS
    to_fix = []
    for user in users:
        slug = user['slug']
        if slug in AUTHOR_BIOS and not user.get('bio'):
            to_fix.append(user)

    print(f"Authors to update: {len(to_fix)}\n")

    if not to_fix:
        print("Nothing to fix!")
        return

    # Show preview
    for user in sorted(to_fix, key=lambda u: u.get('count', {}).get('posts', 0), reverse=True):
        slug = user['slug']
        posts = user.get('count', {}).get('posts', 0)
        print(f"  {user['name']} ({slug}) — {posts} posts")
        print(f"    Bio: \"{AUTHOR_BIOS[slug]}\"")
        print()

    if dry_run:
        print(f"To apply, run: python3 {sys.argv[0]} --apply")
        return

    # Create backup
    os.makedirs(BACKUP_DIR, exist_ok=True)
    backup_file = os.path.join(BACKUP_DIR, f'author-bios-backup-{int(time.time())}.json')
    backup_data = {
        user['slug']: {
            'name': user['name'],
            'bio': user.get('bio') or '',
        }
        for user in to_fix
    }
    with open(backup_file, 'w') as f:
        json.dump(backup_data, f, ensure_ascii=False, indent=2)
    print(f"Backup saved to {backup_file}\n")

    # Apply updates
    success = 0
    errors = 0
    for user in to_fix:
        slug = user['slug']
        try:
            resp = api_put(
                f"/ghost/api/admin/users/{user['id']}/",
                {"users": [{
                    "bio": AUTHOR_BIOS[slug],
                    "updated_at": user['updated_at'],
                }]}
            )
            if resp.get('users'):
                success += 1
                print(f"  OK: {user['name']} ({slug})")
            else:
                errors += 1
                print(f"  ERROR on {slug}: {json.dumps(resp)[:200]}")
        except Exception as e:
            errors += 1
            print(f"  ERROR on {slug}: {e}")

        time.sleep(0.5)

    print(f"\nDone! Updated: {success}, Errors: {errors}")


if __name__ == '__main__':
    main()
