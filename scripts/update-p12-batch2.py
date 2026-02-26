#!/usr/bin/env python3
"""Update P12 batch 2 posts: add feature images, tags, and source disclaimer."""

import json
import jwt
import time
import re
import urllib.request
import urllib.error
import ssl
import os

GHOST_URL = 'https://421bn.ghost.io'
ADMIN_KEY = os.environ.get('GHOST_ADMIN_API_KEY', '')
CONTENT_KEY = '420da6f85b5cc903b347de9e33'

ctx = ssl.create_default_context()


def get_token():
    key_id, secret = ADMIN_KEY.split(':')
    iat = int(time.time())
    payload = {'iat': iat, 'exp': iat + 300, 'aud': '/admin/'}
    return jwt.encode(payload, bytes.fromhex(secret), algorithm='HS256',
                      headers={'kid': key_id})


def fetch_og_image(url):
    """Fetch a P12 article page and extract the og:image meta tag."""
    try:
        req = urllib.request.Request(url, headers={
            'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36'
        })
        with urllib.request.urlopen(req, context=ctx, timeout=15) as resp:
            html = resp.read().decode('utf-8', errors='replace')
        m = re.search(r'<meta\s+(?:property|name)=["\']og:image["\']\s+content=["\']([^"\']+)["\']', html)
        if not m:
            m = re.search(r'content=["\']([^"\']+)["\']\s+(?:property|name)=["\']og:image["\']', html)
        return m.group(1) if m else None
    except Exception as e:
        print(f'    Warning: could not fetch og:image from {url}: {e}')
        return None


def get_post_by_slug(slug):
    """Fetch a post by slug via Admin API (returns full post with lexical)."""
    token = get_token()
    url = f'{GHOST_URL}/ghost/api/admin/posts/slug/{slug}/'
    req = urllib.request.Request(url, headers={'Authorization': f'Ghost {token}'})
    with urllib.request.urlopen(req, context=ctx) as resp:
        data = json.loads(resp.read())
    return data['posts'][0]


def update_post(post_id, updates, updated_at):
    """Update a post via Admin API with optimistic locking."""
    token = get_token()
    updates['updated_at'] = updated_at
    data = json.dumps({'posts': [updates]}).encode('utf-8')
    url = f'{GHOST_URL}/ghost/api/admin/posts/{post_id}/'
    req = urllib.request.Request(url, data=data, method='PUT', headers={
        'Authorization': f'Ghost {token}',
        'Content-Type': 'application/json',
    })
    with urllib.request.urlopen(req, context=ctx) as resp:
        return json.loads(resp.read())['posts'][0]


def append_disclaimer_to_lexical(lexical_str, p12_url, display_date):
    """Append a disclaimer HTML card to the end of Lexical JSON content."""
    lexical = json.loads(lexical_str)
    disclaimer_html = (
        '<hr>'
        '<p><em>Esta nota fue publicada originalmente en '
        f'<a href="{p12_url}" target="_blank" rel="noopener noreferrer">Página/12</a>'
        f' el {display_date}.</em></p>'
    )
    disclaimer_node = {
        "type": "html",
        "version": 1,
        "html": disclaimer_html
    }
    lexical['root']['children'].append(disclaimer_node)
    return json.dumps(lexical)


# ── Article metadata ──
ARTICLES = [
    {
        'ghost_slug': 'p12-por-que-fall-guys-es-el-juego-mas-adictivo-y-popular-del-momento',
        'p12_url': 'https://www.pagina12.com.ar/286653-por-que-fall-guys-es-el-juego-mas-adictivo-y-popular-del-momento',
        'display_date': '21 de agosto de 2020',
        'tags': [{'name': '#es'}, {'name': 'Juegos'}, {'name': 'Videojuegos'}],
    },
    {
        'ghost_slug': 'p12-armas-3d-ni-patron-ni-estado-ni-numero-de-serie',
        'p12_url': 'https://www.pagina12.com.ar/275035-armas-3d-ni-patron-ni-estado-ni-numero-de-serie',
        'display_date': '27 de junio de 2020',
        'tags': [{'name': '#es'}, {'name': 'Tecnología'}, {'name': 'Internet'}],
    },
    {
        'ghost_slug': 'p12-elon-musk-spacex-y-la-parabola-del-espacio-en-la-cultura-pop',
        'p12_url': 'https://www.pagina12.com.ar/270269-elon-musk-spacex-y-la-parabola-del-espacio-en-la-cultura-pop',
        'display_date': '4 de junio de 2020',
        'tags': [{'name': '#es'}, {'name': 'Cultura'}],
    },
    {
        'ghost_slug': 'p12-brave-premios-en-criptomoneda-por-usar-internet',
        'p12_url': 'https://www.pagina12.com.ar/261878-brave-premios-en-criptomoneda-por-usar-internet',
        'display_date': '24 de abril de 2020',
        'tags': [{'name': '#es'}, {'name': 'Tecnología'}, {'name': 'Cripto'}, {'name': 'Internet'}],
    },
    {
        'ghost_slug': 'p12-coronavirus-y-otra-oportunidad-de-entrar-a-las-criptomonedas',
        'p12_url': 'https://www.pagina12.com.ar/252775-coronavirus-y-otra-oportunidad-de-entrar-a-las-criptomonedas',
        'display_date': '13 de marzo de 2020',
        'tags': [{'name': '#es'}, {'name': 'Tecnología'}, {'name': 'Cripto'}],
    },
    {
        'ghost_slug': 'p12-necesitamos-mas-transparencia-corporaciones-gobierno',
        'p12_url': 'https://www.pagina12.com.ar/212914-necesitamos-mas-transparencia-para-saber-como-se-manejan-las-corporaciones-y-el-gobierno',
        'display_date': '18 de agosto de 2019',
        'tags': [{'name': '#es'}, {'name': 'Cultura'}, {'name': 'Internet'}],
    },
    {
        'ghost_slug': 'p12-han-llegado-cartas',
        'p12_url': 'https://www.pagina12.com.ar/89801-han-llegado-cartas',
        'display_date': '18 de enero de 2018',
        'tags': [{'name': '#es'}, {'name': 'Juegos'}, {'name': 'Magic: The Gathering'}],
    },
    {
        'ghost_slug': 'p12-este-es-un-laburo-que-no-se-siente-como-tal',
        'p12_url': 'https://www.pagina12.com.ar/82447-este-es-un-laburo-que-no-se-siente-como-tal',
        'display_date': '14 de diciembre de 2017',
        'tags': [{'name': '#es'}, {'name': 'Vida real'}, {'name': 'Deportes'}],
    },
    {
        'ghost_slug': 'p12-polemica-en-las-galaxias',
        'p12_url': 'https://www.pagina12.com.ar/80873-polemica-en-las-galaxias',
        'display_date': '7 de diciembre de 2017',
        'tags': [{'name': '#es'}, {'name': 'Juegos'}, {'name': 'Videojuegos'}],
    },
    {
        'ghost_slug': 'p12-garganta-con-arena',
        'p12_url': 'https://www.pagina12.com.ar/74587-garganta-con-arena',
        'display_date': '9 de noviembre de 2017',
        'tags': [{'name': '#es'}, {'name': 'Juegos'}, {'name': 'Videojuegos'}],
    },
    {
        'ghost_slug': 'p12-no-dejes-para-manana',
        'p12_url': 'https://www.pagina12.com.ar/71630-no-dejes-para-manana',
        'display_date': '26 de octubre de 2017',
        'tags': [{'name': '#es'}, {'name': 'Tecnología'}],
    },
    {
        'ghost_slug': 'p12-somos-los-piratas',
        'p12_url': 'https://www.pagina12.com.ar/65512-somos-los-piratas',
        'display_date': '28 de septiembre de 2017',
        'tags': [{'name': '#es'}, {'name': 'Juegos'}, {'name': 'Magic: The Gathering'}],
    },
    {
        'ghost_slug': 'p12-melodia-encadenada',
        'p12_url': 'https://www.pagina12.com.ar/55462-melodia-encadenada',
        'display_date': '10 de agosto de 2017',
        'tags': [{'name': '#es'}, {'name': 'Tecnología'}, {'name': 'Cripto'}],
    },
    {
        'ghost_slug': 'p12-cuentos-de-la-criptomoneda',
        'p12_url': 'https://www.pagina12.com.ar/55461-cuentos-de-la-criptomoneda',
        'display_date': '9 de agosto de 2017',
        'tags': [{'name': '#es'}, {'name': 'Tecnología'}, {'name': 'Cripto'}],
    },
    {
        'ghost_slug': 'p12-que-haces-maquina',
        'p12_url': 'https://web.archive.org/web/20170819000734/https://www.pagina12.com.ar/diario/suplementos/no/12-7742-2015-05-07.html',
        'display_date': '7 de mayo de 2015',
        'tags': [{'name': '#es'}, {'name': 'Tecnología'}],
        'fallback_image': 'https://www.pagina12.com.ar/fotos/no/20150507/notas_no/robiot.jpg',
    },
]


if __name__ == '__main__':
    print(f'Updating {len(ARTICLES)} P12 posts...\n')
    ok = 0
    errors = 0

    for i, art in enumerate(ARTICLES, 1):
        slug = art['ghost_slug']
        print(f'[{i}/{len(ARTICLES)}] {slug}')

        # 1. Fetch og:image from P12
        feature_image = art.get('fallback_image')
        if not feature_image:
            print(f'  Fetching og:image from P12...')
            feature_image = fetch_og_image(art['p12_url'])
            if feature_image:
                print(f'  Image: {feature_image[:80]}...')
            else:
                print(f'  No image found')

        # 2. Fetch Ghost post
        try:
            post = get_post_by_slug(slug)
        except Exception as e:
            print(f'  ERROR: Could not fetch post: {e}')
            errors += 1
            continue

        # 3. Append disclaimer to lexical content
        lexical = post.get('lexical', '')
        if not lexical:
            print(f'  ERROR: Post has no lexical content')
            errors += 1
            continue

        new_lexical = append_disclaimer_to_lexical(lexical, art['p12_url'], art['display_date'])

        # 4. Build update payload
        updates = {
            'tags': art['tags'],
            'lexical': new_lexical,
        }
        if feature_image:
            updates['feature_image'] = feature_image

        # 5. Update post
        try:
            result = update_post(post['id'], updates, post['updated_at'])
            print(f'  OK: updated (image: {"yes" if feature_image else "no"}, '
                  f'tags: {[t["name"] for t in art["tags"] if not t["name"].startswith("#")]})')
            ok += 1
        except urllib.error.HTTPError as e:
            body = e.read().decode()
            print(f'  ERROR {e.code}: {body[:300]}')
            errors += 1

        time.sleep(0.5)

    print(f'\nDone: {ok} updated, {errors} errors')
