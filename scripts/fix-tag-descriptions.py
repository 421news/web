#!/usr/bin/env python3
"""
Bulk fix tag descriptions and meta_title for 421.news.
Sets description (used as meta_description by Ghost) and meta_title
for all public tags that are missing them.

Usage:
  python3 scripts/fix-tag-descriptions.py --dry-run    # Preview changes
  python3 scripts/fix-tag-descriptions.py --apply       # Apply changes
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

# --- Tag data ---
# Each tag gets: description (used as meta description) and meta_title (SEO <title>)
TAG_DATA = {
    # ES main categories
    'cultura': {
        'description': 'Ensayos, crónicas y análisis sobre arte, cine, literatura, música y cultura pop. 421 explora la cultura con mirada crítica y sin filtros.',
        'meta_title': 'Cultura: ensayos y análisis | 421.news',
    },
    'tecnologia': {
        'description': 'Artículos sobre privacidad digital, software libre, inteligencia artificial y soberanía tecnológica. Tecnología con pensamiento crítico.',
        'meta_title': 'Tecnología: privacidad, IA y software libre | 421.news',
    },
    'juegos': {
        'description': 'Análisis, reseñas y ensayos sobre juegos de mesa, cartas y videojuegos. Cultura lúdica tomada en serio.',
        'meta_title': 'Juegos: análisis y ensayos | 421.news',
    },
    'vida-real': {
        'description': 'Textos sobre filosofía cotidiana, sociedad, política y la vida fuera de la pantalla. El mundo real, con pensamiento crítico.',
        'meta_title': 'Vida real: filosofía, sociedad y política | 421.news',
    },
    # ES secondary tags
    'argentina': {
        'description': 'Textos sobre Argentina: política, cultura, sociedad y la experiencia argentina vista desde 421.',
        'meta_title': 'Argentina | 421.news',
    },
    'cripto': {
        'description': 'Criptomonedas, blockchain y finanzas descentralizadas explicadas sin humo. Análisis crítico del ecosistema cripto.',
        'meta_title': 'Cripto: blockchain y finanzas descentralizadas | 421.news',
    },
    'deportes': {
        'description': 'Crónicas y análisis deportivos con la mirada cultural de 421.',
        'meta_title': 'Deportes | 421.news',
    },
    'el-canon': {
        'description': 'Los 25 textos esenciales de 421. Una selección editorial con las razones de por qué cada uno importa.',
        'meta_title': 'El canon: los 25 textos esenciales | 421.news',
    },
    'filosofia': {
        'description': 'Ensayos sobre filosofía aplicada a la vida cotidiana. Pensadores clásicos y contemporáneos fuera de la academia.',
        'meta_title': 'Filosofía: ensayos y reflexiones | 421.news',
    },
    'historieta': {
        'description': 'Cómics, manga, historietas y novela gráfica. Reseñas y análisis del mundo de la viñeta.',
        'meta_title': 'Historieta: cómics, manga y novela gráfica | 421.news',
    },
    'internet': {
        'description': 'La cultura de internet: comunidades online, redes sociales y la vida digital. Crónicas de la red.',
        'meta_title': 'Internet: cultura digital y redes | 421.news',
    },
    'libros': {
        'description': 'Reseñas, ensayos y recomendaciones de libros. Literatura, no ficción y todo lo que se pueda leer.',
        'meta_title': 'Libros: reseñas y recomendaciones | 421.news',
    },
    'magic-the-gathering': {
        'description': 'Artículos sobre Magic: The Gathering. Estrategia, lore, comunidad y cultura del juego de cartas coleccionables.',
        'meta_title': 'Magic: The Gathering | 421.news',
    },
    'memes': {
        'description': 'Análisis y crónicas de la cultura memética. Los memes como fenómeno cultural y comunicativo.',
        'meta_title': 'Memes: cultura y análisis | 421.news',
    },
    'musica': {
        'description': 'Artículos sobre música: álbumes, artistas, géneros y la cultura musical en todas sus formas.',
        'meta_title': 'Música: artistas, álbumes y cultura musical | 421.news',
    },
    'peliculas': {
        'description': 'Críticas, análisis y ensayos sobre cine. Películas que importan, explicadas con profundidad.',
        'meta_title': 'Películas: críticas y análisis de cine | 421.news',
    },
    'series': {
        'description': 'Análisis, reseñas y ensayos sobre series de televisión y streaming.',
        'meta_title': 'Series: análisis y reseñas | 421.news',
    },
    'soberania': {
        'description': 'Soberanía digital y tecnológica. Artículos sobre autonomía, privacidad y control de tus datos.',
        'meta_title': 'Soberanía digital y tecnológica | 421.news',
    },
    'tutoriales': {
        'description': 'Guías paso a paso: configuración de software, herramientas digitales y trucos técnicos. Hazlo vos mismo.',
        'meta_title': 'Tutoriales: guías y herramientas | 421.news',
    },
    'videojuegos': {
        'description': 'Análisis, reseñas y ensayos sobre videojuegos. La industria gamer con mirada cultural.',
        'meta_title': 'Videojuegos: análisis y reseñas | 421.news',
    },
    'warhammer': {
        'description': 'Artículos sobre Warhammer 40K y Age of Sigmar. Lore, pintura, estrategia y comunidad.',
        'meta_title': 'Warhammer: lore, pintura y estrategia | 421.news',
    },
    'wiki': {
        'description': 'Entradas enciclopédicas de 421: definiciones, conceptos y referencias rápidas sobre los temas que cubrimos.',
        'meta_title': 'Wiki: enciclopedia 421 | 421.news',
    },
    # EN main categories
    'culture': {
        'description': 'Essays, features, and analysis on art, film, music, and pop culture. Critical takes on the things that matter.',
        'meta_title': 'Culture: essays and analysis | 421.news',
    },
    'tech': {
        'description': 'Articles on digital privacy, open source, AI, and tech sovereignty. Technology through a critical lens.',
        'meta_title': 'Tech: privacy, AI, and open source | 421.news',
    },
    'games': {
        'description': 'Analysis and essays on board games, card games, and video games. Play culture taken seriously.',
        'meta_title': 'Games: analysis and essays | 421.news',
    },
    'real-life': {
        'description': 'Writing about everyday philosophy, society, politics, and life beyond the screen.',
        'meta_title': 'Real Life: philosophy, society, and politics | 421.news',
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
    print(f"=== 421 Tag Descriptions Fix ({mode}) ===\n")

    print("Fetching all public tags...")
    data = api_get('/ghost/api/admin/tags/?limit=all&filter=visibility:public')
    tags = data.get('tags', [])
    print(f"  Total: {len(tags)} public tags\n")

    # Filter tags that need updates
    to_fix = []
    for tag in tags:
        slug = tag['slug']
        if slug not in TAG_DATA:
            continue
        needs_update = (
            not tag.get('description')
            or not tag.get('meta_title')
        )
        if needs_update:
            to_fix.append(tag)

    print(f"Tags needing description/meta_title: {len(to_fix)}\n")

    if not to_fix:
        print("Nothing to fix!")
        return

    # Show preview
    for tag in sorted(to_fix, key=lambda t: t['slug']):
        slug = tag['slug']
        td = TAG_DATA[slug]
        print(f"  [{slug}]")
        if not tag.get('description'):
            print(f"    description: \"{td['description']}\"")
        if not tag.get('meta_title'):
            print(f"    meta_title:  \"{td['meta_title']}\"")
        print()

    if dry_run:
        print(f"To apply, run: python3 {sys.argv[0]} --apply")
        return

    # Create backup
    os.makedirs(BACKUP_DIR, exist_ok=True)
    backup_file = os.path.join(BACKUP_DIR, f'tag-descriptions-backup-{int(time.time())}.json')
    backup_data = {
        tag['slug']: {
            'description': tag.get('description') or '',
            'meta_title': tag.get('meta_title') or '',
            'meta_description': tag.get('meta_description') or '',
        }
        for tag in to_fix
    }
    with open(backup_file, 'w') as f:
        json.dump(backup_data, f, ensure_ascii=False, indent=2)
    print(f"Backup saved to {backup_file}\n")

    # Apply updates
    success = 0
    errors = 0
    for tag in to_fix:
        slug = tag['slug']
        td = TAG_DATA[slug]
        update = {}
        if not tag.get('description'):
            update['description'] = td['description']
        if not tag.get('meta_title'):
            update['meta_title'] = td['meta_title']
        # updated_at for optimistic locking
        update['updated_at'] = tag['updated_at']

        try:
            resp = api_put(
                f"/ghost/api/admin/tags/{tag['id']}/",
                {"tags": [update]}
            )
            if resp.get('tags'):
                success += 1
                print(f"  OK: {slug}")
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
