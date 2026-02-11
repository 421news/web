#!/usr/bin/env python3
"""
Regenera related-posts.json y sube el theme a Ghost.
Uso: python3 scripts/update-related.py
"""

import json
import re
import os
import subprocess
import urllib.request
import math

CONTENT_API_KEY = '420da6f85b5cc903b347de9e33'
GHOST_HOST = 'www.421.news'
THEME_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# --- Semantic concept bridges ---
CONCEPT_MAP = {
    'pokémon': 'anime manga videojuego franquicia nintendo tcg coleccionable japón otaku',
    'pokemon': 'anime manga videogame franchise nintendo tcg collectible japan otaku',
    'anime': 'manga japón otaku serie animación videojuego japan animation',
    'manga': 'anime japón otaku comic historieta japan',
    'otaku': 'anime manga japón cosplay fujoshi',
    'cosplay': 'anime manga otaku convención fandom',
    'fujoshi': 'anime manga otaku fanfic fandom',
    'jujutsu': 'anime manga shonen japón otaku',
    'frieren': 'anime manga fantasy japón otaku',
    'demon slayer': 'anime manga shonen japón otaku kimetsu',
    'kimetsu': 'anime manga shonen japón otaku',
    'robotech': 'anime mecha japón serie animación',
    'gojira': 'japón kaiju cine película monstruo tokusatsu',
    'godzilla': 'japón kaiju cine película monstruo tokusatsu',
    'ōtomo': 'manga anime akira japón comic',
    'akira': 'manga anime japón cyberpunk',
    'one piece': 'anime manga shonen serie japón',
    'bluey': 'animación serie infantil dibujo cartoon',
    'tcg': 'carta coleccionable trading card magic pokemon videojuego gaming',
    'magic the gathering': 'tcg carta coleccionable draft arena formato torneo',
    'magic': 'tcg carta coleccionable gathering arena draft',
    'mtg': 'tcg magic carta coleccionable gathering',
    'premodern': 'magic tcg carta coleccionable formato',
    'ultimate team': 'tcg carta coleccionable gaming fifa ea',
    'trading card': 'tcg coleccionable magic pokemon carta',
    'videojuego': 'gaming consola juego gamer pixel retro indie',
    'videogame': 'gaming console game gamer pixel retro indie',
    'playstation': 'consola sony videojuego gaming ps1 ps2',
    'nintendo': 'consola videojuego gaming mario pokemon snes nes',
    'snes': 'nintendo consola retro 16bit videojuego',
    'nes': 'nintendo consola retro 8bit videojuego famicom',
    'pixel art': 'retro videojuego indie gaming estético',
    'retrogaming': 'retro videojuego consola nostalgia clásico',
    'elden ring': 'videojuego fromsoftware souls rpg',
    'silent hill': 'videojuego horror terror survival',
    'diablo': 'videojuego rpg blizzard hack slash',
    'starcraft': 'videojuego estrategia blizzard esport',
    'civilization': 'videojuego estrategia turno 4x historia',
    'commandos': 'videojuego estrategia táctica retro',
    'argentum': 'videojuego mmorpg argentino online comunidad',
    'indie': 'videojuego independiente gaming desarrollo',
    'fear hunger': 'videojuego horror dungeon rpg',
    'juegos de mesa': 'tablero tabletop dados cartas familia boardgame hobby',
    'board game': 'tabletop dice cards family boardgame hobby',
    'tabletop': 'mesa tablero boardgame dados hobby',
    'warhammer': 'miniatura tabletop mesa figurin Games Workshop estrategia',
    'space hulk': 'warhammer boardgame tabletop mesa Games Workshop',
    'maldón': 'juegos mesa tablero familia argentino',
    'rol': 'mesa tabletop rpg dados aventura personaje',
    'metal': 'rock música heavy banda guitarra thrash death doom',
    'thrash': 'metal rock heavy música banda',
    'death metal': 'metal heavy música progresivo banda',
    'punk': 'rock underground indie diy música banda',
    'rock': 'música banda guitarra concierto festival',
    'bluegrass': 'música folk country americana instrumento banjo',
    'noise': 'música experimental sonido underground diy',
    'psicodelia': 'música rock experimental lisérgico droga',
    'psychedelia': 'music rock experimental psychedelic drug',
    'dungeon synth': 'metal música medieval fantasy ambient',
    'babasonicos': 'rock argentino música banda alternativo',
    'black sabbath': 'metal rock heavy música banda ozzy birmingham',
    'comic': 'historieta superhéroe marvel dc manga novela gráfica',
    'comics': 'comic superhero marvel dc manga graphic novel',
    'batman': 'dc comic superhéroe gotham historieta',
    'superman': 'dc comic superhéroe krypton historieta',
    'fantastic four': 'marvel comic superhero team',
    'marvel': 'comic superhéroe avengers spider fantastic',
    'dc': 'comic superhéroe batman superman justice',
    'alan moore': 'comic historieta watchmen swamp thing graphic novel',
    'grant morrison': 'comic superhéroe dc marvel historieta',
    'historieta': 'comic manga superhéroe novela gráfica',
    'lovecraft': 'horror cósmico terror cthulhu weird ficción literatura',
    'horror comic': 'manga terror historieta halloween',
    'película': 'cine film director actor serie',
    'movie': 'cinema film director actor series',
    'slasher': 'horror terror película cine halloween',
    'robocop': 'ciencia ficción cine película cyberpunk',
    'blade runner': 'ciencia ficción cine película cyberpunk',
    'matrix': 'ciencia ficción cine película cyberpunk anime',
    'hackers': 'cine película cyberpunk internet hacker',
    'ia': 'inteligencia artificial machine learning tecnología computadora',
    'ai': 'artificial intelligence machine learning technology computer',
    'linux': 'open source software computadora sistema operativo',
    'quantum': 'computadora tecnología qubit ciencia',
    'crispr': 'genética biotecnología ciencia edición',
    'microchip': 'semiconductor tecnología computadora hardware',
    'internet': 'web digital online red tecnología',
    '4chan': 'internet foro meme cultura online anónimo reddit chan',
    'crypto': 'blockchain bitcoin ethereum descentralizado web3',
    'small web': 'internet protocolo abierto comunidad alternativo',
    'colección': 'coleccionable vintage objeto hobby figura',
    'collection': 'collectible vintage object hobby figure',
    'vintage': 'retro colección nostalgia coleccionable',
    'kenner': 'juguete figura coleccionable alien acción',
    'playmates': 'juguete figura coleccionable tortugas ninja acción',
    'escritor': 'literatura libro novela cuento autor escritura',
    'writer': 'literature book novel story author writing',
    'pynchon': 'literatura novela posmoderno ficción autor',
    'argentino': 'argentina nacional local Buenos Aires',
    'argentine': 'argentina national local Buenos Aires',
}

ES_STOP = ['el', 'la', 'los', 'las', 'un', 'una', 'de', 'del', 'en', 'y', 'a', 'por',
           'con', 'para', 'que', 'es', 'se', 'al', 'lo', 'su', 'como', 'más', 'pero', 'sus',
           'le', 'ya', 'o', 'este', 'ha', 'si', 'esta', 'entre', 'cuando', 'sin', 'sobre',
           'ser', 'también', 'me', 'hasta', 'hay', 'donde', 'desde', 'todo', 'nos', 'durante',
           'todos', 'uno', 'les', 'ni', 'otros', 'ese', 'eso', 'ante', 'ellos', 'esto',
           'antes', 'algunos', 'otro', 'otras', 'otra', 'él', 'tanto', 'esa', 'estos',
           'mucho', 'nada', 'muchos', 'poco', 'ella', 'estar', 'algo', 'nosotros']


def fetch_all_posts():
    all_posts = []
    page = 1
    while True:
        url = (f'https://{GHOST_HOST}/ghost/api/content/posts/'
               f'?key={CONTENT_API_KEY}&page={page}&limit=100'
               f'&include=tags&fields=slug,title,excerpt,custom_excerpt')
        print(f'  Fetching page {page}...')
        with urllib.request.urlopen(url) as resp:
            data = json.loads(resp.read())
        if 'posts' not in data:
            print(f'  Error: {json.dumps(data)[:200]}')
            break
        all_posts.extend(data['posts'])
        if not data['meta']['pagination'].get('next'):
            break
        page += 1
    return all_posts


def expand_text(text):
    text_lower = text.lower()
    expansions = []
    for keyword, concepts in CONCEPT_MAP.items():
        if keyword.lower() in text_lower:
            expansions.append(concepts)
    return text + ' ' + ' '.join(expansions)


def compute_related(posts, lang):
    from sklearn.feature_extraction.text import TfidfVectorizer
    from sklearn.metrics.pairwise import cosine_similarity
    import numpy as np

    corpus = []
    slugs = []
    for p in posts:
        title = p.get('title', '') or ''
        excerpt = p.get('custom_excerpt') or p.get('excerpt') or ''
        excerpt = re.sub(r'<[^>]+>', '', excerpt)
        tags = ' '.join(t['name'] for t in p.get('tags', []) if t.get('visibility') == 'public')
        text = f"{title} {title} {title} {tags} {tags} {excerpt}"
        text = expand_text(text)
        corpus.append(text)
        slugs.append(p['slug'])

    if lang == 'es':
        vectorizer = TfidfVectorizer(ngram_range=(1, 2), max_features=15000, stop_words=ES_STOP, min_df=1)
    else:
        vectorizer = TfidfVectorizer(ngram_range=(1, 2), max_features=15000, stop_words='english', min_df=1)

    tfidf_matrix = vectorizer.fit_transform(corpus)
    sim_matrix = cosine_similarity(tfidf_matrix)

    result = {}
    for i, slug in enumerate(slugs):
        scores = sim_matrix[i].copy()
        scores[i] = -1
        top_indices = np.argsort(scores)[-4:][::-1]
        result[slug] = [slugs[j] for j in top_indices]

    return result


def upload_and_activate():
    """Zip the theme, upload to Ghost, and activate."""
    zip_path = '/tmp/421-theme.zip'
    if os.path.exists(zip_path):
        os.remove(zip_path)

    print('\nZipping theme...')
    subprocess.run(
        ['zip', '-r', zip_path, '.', '-x', '.git/*', 'node_modules/*', '.github/*', 'scripts/*'],
        cwd=THEME_DIR, capture_output=True
    )

    print('Uploading and activating...')
    script = f"""
    const jwt = require('jsonwebtoken');
    const fs = require('fs');
    const FormData = require('form-data');
    const https = require('https');
    const key = 'GHOST_ADMIN_API_KEY_REDACTED';
    const [id, secret] = key.split(':');
    const token = jwt.sign({{}}, Buffer.from(secret, 'hex'), {{ keyid: id, algorithm: 'HS256', expiresIn: '5m', audience: '/admin/' }});
    const form = new FormData();
    form.append('file', fs.createReadStream('{zip_path}'));
    const req = https.request({{
      hostname: '421bn.ghost.io', path: '/ghost/api/admin/themes/upload/', method: 'POST',
      headers: {{ ...form.getHeaders(), 'Authorization': 'Ghost ' + token }}
    }}, (res) => {{
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {{
        console.log('Upload:', res.statusCode);
        const d = JSON.stringify({{themes:[{{name:'421-theme'}}]}});
        const req2 = https.request({{
          hostname: '421bn.ghost.io', path: '/ghost/api/admin/themes/421-theme/activate/', method: 'PUT',
          headers: {{ 'Content-Type':'application/json', 'Content-Length': Buffer.byteLength(d), 'Authorization': 'Ghost ' + token }}
        }}, (res2) => {{
          let body = '';
          res2.on('data', c => body += c);
          res2.on('end', () => console.log('Activate:', res2.statusCode));
        }});
        req2.write(d); req2.end();
      }});
    }});
    form.pipe(req);
    """
    subprocess.run(['node', '-e', script], cwd=THEME_DIR)


def main():
    print('=== 421 Related Posts Updater ===\n')

    print('Fetching all posts from Ghost...')
    all_posts = fetch_all_posts()
    print(f'  Total: {len(all_posts)} posts\n')

    es = [p for p in all_posts if any(t['slug'] == 'hash-es' for t in p.get('tags', []))]
    en = [p for p in all_posts if any(t['slug'] == 'hash-en' for t in p.get('tags', []))]
    print(f'ES: {len(es)} | EN: {len(en)}\n')

    result = {}

    if es:
        print('Computing ES related posts...')
        result.update(compute_related(es, 'es'))

    if en:
        print('Computing EN related posts...')
        result.update(compute_related(en, 'en'))

    out_path = os.path.join(THEME_DIR, 'assets', 'data', 'related-posts.json')
    os.makedirs(os.path.dirname(out_path), exist_ok=True)
    with open(out_path, 'w') as f:
        json.dump(result, f)
    print(f'\nSaved {len(result)} posts to related-posts.json')

    upload_and_activate()
    print('\nDone!')


if __name__ == '__main__':
    main()
