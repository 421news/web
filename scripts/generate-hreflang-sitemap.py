#!/usr/bin/env python3
"""
Genera el sitemap de hreflang leyendo los pares YA DECLARADOS en cada post.

  python3 scripts/generate-hreflang-sitemap.py            # genera el sitemap
  python3 scripts/generate-hreflang-sitemap.py --dry-run  # solo reporta, no escribe

POR QUÉ SE REESCRIBIÓ (2026-08-08)
----------------------------------
La versión anterior re-derivaba los pares con su propia heurística (proximidad temporal
+ solapamiento de slug) y podía además inyectar los metas con `--inject-meta`. Eso creaba
DOS sistemas adivinando la misma relación por separado: este script y el webhook de
hreflang. Cuando discrepaban, ganaba el último que corría.

Ese diseño fue exactamente la causa de que Bond quedara apareado con Evangelion, Feral
House con Daniela D'Adamo y Adicción digital con Cyberciruja: heurísticas por tiempo que
al publicar en tanda eligen cualquier cosa.

Ahora hay una única fuente de verdad: los metas `english-version` / `spanish-version` de
cada post, que el webhook escribe y `auditarHreflang()` vigila a diario. Este script solo
LEE. Nunca escribe metas — si el sitemap sale mal, el problema está en los metas y se
arregla ahí, no acá.

Los posts sin par declarado se reportan al final para revisión manual. No se adivinan.
"""

import json
import re
import sys
import urllib.request

CONTENT_KEY = '420da6f85b5cc903b347de9e33'
HOST = 'https://421bn.ghost.io'
SITE = 'https://www.421.news'
SALIDA = 'assets/data/hreflang-sitemap.xml'

DRY_RUN = '--dry-run' in sys.argv

META_RE = re.compile(r'name="(english|spanish)-version" content="([^"]+)"')


def traer_posts():
    """Todos los publicados, con su codeinjection_head y sus tags de idioma."""
    posts, page, total = [], 1, 1
    while len(posts) < total:
        url = (f'{HOST}/ghost/api/content/posts/?key={CONTENT_KEY}'
               f'&limit=100&page={page}&include=tags'
               f'&fields=slug,codeinjection_head')
        req = urllib.request.Request(url, headers={'Accept-Version': 'v5.0'})
        with urllib.request.urlopen(req) as r:
            data = json.loads(r.read())
        total = data['meta']['pagination']['total']
        posts.extend(data['posts'])
        page += 1
        if page > 30:
            break
    return posts


def idioma(post):
    for t in post.get('tags') or []:
        s = t.get('slug', '')
        if s.startswith('hash-') and s[5:] in ('es', 'en', 'pt', 'fr', 'zh', 'ja', 'ko', 'tr'):
            return s[5:]
    return 'es'


def par_declarado(post):
    m = META_RE.search(post.get('codeinjection_head') or '')
    return m.group(2) if m else None


def main():
    posts = traer_posts()
    por_slug = {p['slug']: p for p in posts}

    pares = []          # (slug_es, slug_en)
    sin_par = []
    inconsistentes = []
    vistos = set()

    for p in posts:
        lang = idioma(p)
        if lang not in ('es', 'en'):
            continue                        # las intl no usan este meta
        destino = par_declarado(p)
        if not destino:
            sin_par.append(p['slug'])
            continue
        otro = por_slug.get(destino)
        if not otro:
            inconsistentes.append((p['slug'], destino, 'destino no publicado'))
            continue
        # Solo se toma el par una vez, desde el lado español
        es, en = (p['slug'], destino) if lang == 'es' else (destino, p['slug'])
        if es in vistos:
            continue
        # La reciprocidad la vigila auditarHreflang(); acá solo se avisa si no cierra
        vuelta = par_declarado(por_slug[en]) if en in por_slug else None
        if vuelta and vuelta != es:
            inconsistentes.append((es, en, f'el par devuelve {vuelta}'))
            continue
        vistos.add(es)
        pares.append((es, en))

    pares.sort()

    partes = ['<?xml version="1.0" encoding="UTF-8"?>',
              '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"',
              '        xmlns:xhtml="http://www.w3.org/1999/xhtml">',
              '',
              '  <!-- Homepage -->']
    for loc in (f'{SITE}/es/', f'{SITE}/en/'):
        partes += ['  <url>',
                   f'    <loc>{loc}</loc>',
                   f'    <xhtml:link rel="alternate" hreflang="es" href="{SITE}/es/" />',
                   f'    <xhtml:link rel="alternate" hreflang="en" href="{SITE}/en/" />',
                   f'    <xhtml:link rel="alternate" hreflang="x-default" href="{SITE}/" />',
                   '  </url>']

    partes += ['', '  <!-- Bilingual post pairs -->']
    for es, en in pares:
        for loc in (f'{SITE}/es/{es}/', f'{SITE}/en/{en}/'):
            partes += ['  <url>',
                       f'    <loc>{loc}</loc>',
                       f'    <xhtml:link rel="alternate" hreflang="es" href="{SITE}/es/{es}/" />',
                       f'    <xhtml:link rel="alternate" hreflang="en" href="{SITE}/en/{en}/" />',
                       '  </url>']
    partes += ['', '</urlset>', '']
    xml = '\n'.join(partes)

    print(f'posts publicados: {len(posts)}')
    print(f'pares ES/EN declarados: {len(pares)}  →  {len(pares) * 2 + 2} entradas <url>')
    print(f'sin par declarado: {len(sin_par)}')
    if inconsistentes:
        print(f'\n⚠ inconsistentes (NO entran al sitemap; revisar con /api/hreflang/audit): {len(inconsistentes)}')
        for a, b, motivo in inconsistentes[:10]:
            print(f'   {a} → {b}  ({motivo})')

    if DRY_RUN:
        print('\n(dry run — no se escribió nada)')
        return
    with open(SALIDA, 'w', encoding='utf8') as f:
        f.write(xml)
    print(f'\nescrito: {SALIDA} ({len(xml) / 1024:.0f} KB)')
    print('Falta bumpear la versión en package.json y deployar para que se publique.')


if __name__ == '__main__':
    main()
