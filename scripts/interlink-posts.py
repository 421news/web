#!/usr/bin/env python3
"""
Adds contextual internal links between 421.news posts.
For each post, finds related NEWER posts and adds links where
natural anchor text exists in the content.

Usage:
  python3 scripts/interlink-posts.py --dry-run    # Preview changes
  python3 scripts/interlink-posts.py --apply       # Apply changes
  python3 scripts/interlink-posts.py --dry-run --limit 5  # Preview first 5
"""

import json
import re
import sys
import time
import urllib.request
import hashlib
import hmac
import struct
import base64
import copy
import os

# --- Config ---
ADMIN_KEY = os.environ.get('GHOST_ADMIN_API_KEY', '')
GHOST_HOST = '421bn.ghost.io'
SITE_URL = 'https://www.421.news'
MAX_LINKS_PER_POST = 5
MIN_ANCHOR_LEN = 5
# Skip posts that already have this many or more internal 421 links
MAX_EXISTING_INTERNAL_LINKS = 20

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
BACKUP_DIR = os.path.join(SCRIPT_DIR, '..', 'backups')

# --- Comprehensive stopwords for anchor filtering ---
STOPWORDS = {
    # Spanish function words
    'el', 'la', 'los', 'las', 'un', 'una', 'unos', 'unas', 'de', 'del', 'en',
    'y', 'a', 'por', 'con', 'para', 'que', 'es', 'se', 'al', 'lo', 'su', 'sus',
    'como', 'más', 'pero', 'ya', 'le', 'les', 'me', 'te', 'nos', 'si', 'no',
    'ni', 'este', 'esta', 'estos', 'estas', 'ese', 'esa', 'esos', 'esas',
    'esto', 'eso', 'entre', 'cuando', 'sin', 'sobre', 'desde', 'hasta',
    'donde', 'todo', 'toda', 'todos', 'todas', 'otro', 'otra', 'otros', 'otras',
    'cada', 'mucho', 'mucha', 'muchos', 'muchas', 'poco', 'poca', 'tanto',
    'muy', 'tan', 'algo', 'nada', 'alguien', 'nadie', 'mismo', 'misma',
    'cual', 'cuál', 'quien', 'quién', 'qué', 'cómo', 'dónde', 'cuándo',
    'porque', 'porqué', 'aunque', 'también', 'además', 'siempre', 'nunca',
    'antes', 'después', 'durante', 'entonces', 'ahora', 'aquí', 'allí',
    # Spanish common verbs
    'ser', 'estar', 'haber', 'tener', 'hacer', 'poder', 'decir', 'dar',
    'hay', 'fue', 'sido', 'tiene', 'puede', 'hace', 'dice', 'dijo',
    'era', 'son', 'está', 'han', 'tiene', 'había', 'será', 'siendo',
    'creo', 'vamos', 'podría', 'podemos', 'quiero', 'puedo', 'hizo',
    'solo', 'sólo', 'bien', 'así', 'aún', 'primer', 'primera', 'nuevo',
    'nueva', 'nuevos', 'nuevas', 'gran', 'grande', 'mejor', 'peor',
    'mayor', 'menor', 'último', 'última', 'últimos', 'últimas',
    # Common verbs that make bad anchors
    'funciona', 'protege', 'tendrá', 'quiere', 'parece', 'llega',
    'necesita', 'habla', 'existe', 'trabaja', 'juega', 'cambia',
    'hacemos', 'tenemos', 'dicen', 'busca', 'lleva', 'espera',
    'tenga', 'hagan', 'quede', 'pueda',
    # Common generic nouns that make bad anchors
    'episodio', 'episodios',
    'parte', 'forma', 'manera', 'mundo', 'vida', 'tiempo', 'momento',
    'nombre', 'acción', 'poder', 'punto', 'lado', 'caso', 'hecho',
    'tipo', 'nivel', 'medio', 'final', 'serie', 'historia', 'sistema',
    'lugar', 'ciudad', 'gente', 'persona', 'personas', 'cosas', 'cosa',
    'espacio', 'social', 'cultura', 'cultural', 'culturales', 'político',
    'segundo', 'tercero', 'cuarto', 'efectos', 'concepto', 'proceso',
    'detrás', 'dentro', 'fuera', 'torno', 'través', 'ritual',
    'Carlos', 'carlos', 'Miguel', 'miguel', 'Daniel', 'daniel',
    # English function words
    'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of',
    'with', 'by', 'from', 'as', 'is', 'was', 'are', 'be', 'has', 'had', 'its',
    'this', 'that', 'how', 'what', 'who', 'why', 'can', 'will', 'our', 'your',
    'not', 'all', 'they', 'their', 'them', 'been', 'have', 'would', 'could',
    'should', 'about', 'into', 'more', 'some', 'than', 'only', 'just',
    'also', 'very', 'when', 'where', 'which', 'there', 'then', 'these',
    'those', 'each', 'every', 'other', 'after', 'before', 'between',
    'new', 'old', 'first', 'last', 'great', 'good', 'best', 'most',
}

# Words that indicate newsletter/promo titles (skip these posts as link targets)
PROMO_KEYWORDS = {
    'promo', 'wizard', 'wizards', 'suscri', 'subscri', 'newsletter',
    'invitación', 'invitation', 'exclusiv', 'drop', 'claimeá',
    'aviso', 'pagos', 'mail', 'aprovechá', 'despertaste',
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


# --- Fetch all posts ---
def fetch_all_posts():
    all_posts = []
    page = 1
    while True:
        print(f'  Fetching page {page}...')
        data = api_get(
            f'/ghost/api/admin/posts/?page={page}&limit=100'
            f'&formats=lexical&fields=id,slug,title,lexical,published_at,updated_at,url'
            f'&include=tags'
        )
        if 'posts' not in data:
            print(f'  Error: {json.dumps(data)[:200]}')
            break
        all_posts.extend(data['posts'])
        if not data['meta']['pagination'].get('next'):
            break
        page += 1
    return all_posts


# --- Extract text from lexical ---
def extract_text_from_lexical(lexical):
    """Get all plain text from a lexical document."""
    texts = []

    def walk(node):
        if isinstance(node, dict):
            if node.get('type') == 'extended-text' and 'text' in node:
                texts.append(node['text'])
            for child in node.get('children', []):
                walk(child)
            if 'root' in node:
                walk(node['root'])
        elif isinstance(node, list):
            for item in node:
                walk(item)

    walk(lexical)
    return ' '.join(texts)


def count_internal_links(lexical):
    """Count how many links point to 421.news."""
    count = 0

    def walk(node):
        nonlocal count
        if isinstance(node, dict):
            if node.get('type') == 'link' and '421.news' in (node.get('url') or ''):
                count += 1
            for child in node.get('children', []):
                walk(child)
            if 'root' in node:
                walk(node['root'])

    walk(lexical)
    return count


def get_existing_link_urls(lexical):
    """Get all URLs already linked in the post."""
    urls = set()

    def walk(node):
        if isinstance(node, dict):
            if node.get('type') == 'link':
                urls.add(node.get('url', ''))
            for child in node.get('children', []):
                walk(child)
            if 'root' in node:
                walk(node['root'])

    walk(lexical)
    return urls


# --- Keyword extraction from titles ---
def is_promo_title(title):
    """Check if a title looks like a newsletter/promo post."""
    title_lower = title.lower()
    return any(kw in title_lower for kw in PROMO_KEYWORDS)


def has_content_word(phrase):
    """Check that a phrase has at least one non-stopword of 4+ chars."""
    words = phrase.split()
    return any(w.lower() not in STOPWORDS and len(w) >= 4 for w in words)


def extract_anchor_candidates(title):
    """Extract potential anchor text phrases from a post title.
    Returns phrases ordered from most specific (longest) to least."""
    # Clean title
    title = re.sub(r'[:\-–—|/]', ' ', title)
    title = re.sub(r'[¿¡?!"""\'(){}[\]#]', '', title)
    title = re.sub(r'\s+', ' ', title).strip()

    candidates = []
    words = title.split()

    # Full title (if short enough and distinctive)
    if 2 <= len(words) <= 6 and has_content_word(title):
        candidates.append(title)

    # 4-word phrases
    for i in range(len(words) - 3):
        phrase = ' '.join(words[i:i+4])
        if has_content_word(phrase):
            candidates.append(phrase)

    # 3-word phrases
    for i in range(len(words) - 2):
        phrase = ' '.join(words[i:i+3])
        if has_content_word(phrase):
            candidates.append(phrase)

    # 2-word phrases (require at least one word 5+ chars)
    for i in range(len(words) - 1):
        phrase = ' '.join(words[i:i+2])
        if any(len(w) >= 5 and w.lower() not in STOPWORDS for w in phrase.split()):
            candidates.append(phrase)

    # Single distinctive words (7+ chars, not a stopword, likely a proper noun or topic)
    for w in words:
        if len(w) >= 7 and w.lower() not in STOPWORDS:
            candidates.append(w)

    return candidates


def find_anchor_in_text(text_lower, candidates):
    """Find the best matching candidate in the text. Prefers longer matches.
    Only matches complete words (word boundaries on both sides)."""
    for candidate in candidates:
        pattern = r'\b' + re.escape(candidate.lower()) + r'\b'
        if re.search(pattern, text_lower):
            return candidate
    return None


# --- Lexical modification ---
def add_link_to_lexical(lexical, anchor_text, url):
    """
    Find anchor_text in lexical content and wrap it in a link node.
    Only modifies text inside paragraphs (not headings, not inside existing links).
    Returns True if modified, False if not found.
    """
    root = lexical.get('root', lexical)
    anchor_lower = anchor_text.lower()

    for para in root.get('children', []):
        # Only modify paragraphs, not headings or other blocks
        if para.get('type') not in ('paragraph',):
            continue

        children = para.get('children', [])
        for i, child in enumerate(children):
            # Skip if already inside a link or not a text node
            if child.get('type') != 'extended-text':
                continue

            text = child.get('text', '')
            # Use word boundary regex to avoid matching partial words
            match = re.search(r'\b' + re.escape(anchor_lower) + r'\b', text.lower())
            if not match:
                continue

            idx = match.start()
            # Found the anchor text - extract the EXACT case from original
            actual_anchor = text[idx:idx + len(anchor_text)]
            before = text[:idx]
            after = text[idx + len(anchor_text):]

            # Build new nodes
            new_nodes = []

            if before:
                before_node = dict(child)
                before_node['text'] = before
                new_nodes.append(before_node)

            # Link node
            link_text_node = dict(child)
            link_text_node['text'] = actual_anchor
            link_node = {
                "type": "link",
                "version": 1,
                "url": url,
                "rel": "noreferrer",
                "target": None,
                "title": None,
                "direction": "ltr",
                "format": "",
                "indent": 0,
                "children": [link_text_node]
            }
            new_nodes.append(link_node)

            if after:
                after_node = dict(child)
                after_node['text'] = after
                new_nodes.append(after_node)

            # Replace in parent
            para['children'] = children[:i] + new_nodes + children[i+1:]
            return True

    return False


# --- Main logic ---
def build_relatedness_graph(related_map):
    """Build a bidirectional relatedness graph with 1st and 2nd degree connections.
    Returns dict: slug -> set of (related_slug, score) tuples.
    Score: 1.0 for direct relation, 0.5 for 2nd-degree."""
    graph = {}

    # 1st degree: direct relations (bidirectional)
    for slug, related_slugs in related_map.items():
        if slug not in graph:
            graph[slug] = {}
        for r in related_slugs:
            graph[slug][r] = 1.0
            if r not in graph:
                graph[r] = {}
            graph[r][slug] = max(graph[r].get(slug, 0), 0.8)

    # 2nd degree: friends of friends
    second_degree = {}
    for slug, relations in graph.items():
        second_degree[slug] = dict(relations)
        for r, score in relations.items():
            for r2, score2 in graph.get(r, {}).items():
                if r2 != slug and r2 not in relations:
                    new_score = score * score2 * 0.5
                    if new_score > second_degree[slug].get(r2, 0):
                        second_degree[slug][r2] = new_score

    return second_degree


def get_shared_tags(post_a, post_b):
    """Get the number of shared public tags between two posts."""
    tags_a = {t['slug'] for t in post_a.get('tags', []) if t.get('visibility') == 'public'}
    tags_b = {t['slug'] for t in post_b.get('tags', []) if t.get('visibility') == 'public'}
    return len(tags_a & tags_b)


def compute_links(posts):
    """
    For each post, find up to MAX_LINKS_PER_POST newer related posts
    where we can add contextual links. Uses semantic relatedness from
    related-posts.json + shared tags to prioritize topically relevant links.
    """
    posts_sorted = sorted(posts, key=lambda p: p.get('published_at') or '')
    slug_to_post = {p['slug']: p for p in posts_sorted}

    def get_lang(post):
        for t in post.get('tags', []):
            if t['slug'] == 'hash-en':
                return 'en'
            if t['slug'] == 'hash-es':
                return 'es'
        return 'unknown'

    # Load TF-IDF similarity data
    related_path = os.path.join(SCRIPT_DIR, '..', 'assets', 'data', 'related-posts.json')
    related_map = {}
    if os.path.exists(related_path):
        with open(related_path) as f:
            related_map = json.load(f)
        print(f"  Loaded {len(related_map)} posts from related-posts.json")

    relatedness = build_relatedness_graph(related_map)

    results = []

    for idx, post in enumerate(posts_sorted):
        if not post.get('lexical'):
            continue

        try:
            lexical = json.loads(post['lexical'])
        except (json.JSONDecodeError, TypeError):
            continue

        existing_count = count_internal_links(lexical)
        if existing_count >= MAX_EXISTING_INTERNAL_LINKS:
            continue

        existing_urls = get_existing_link_urls(lexical)
        full_text = extract_text_from_lexical(lexical)
        text_lower = full_text.lower()
        lang = get_lang(post)
        post_date = post.get('published_at') or ''

        # Get this post's relatedness scores
        post_relations = relatedness.get(post['slug'], {})

        # Find newer posts in same language
        newer_posts = [
            p for p in posts_sorted
            if p['slug'] != post['slug']
            and get_lang(p) == lang
            and (p.get('published_at') or '') > post_date
        ]

        link_candidates = []
        for newer in newer_posts:
            # Skip promos/newsletters
            if is_promo_title(newer['title']):
                continue

            lang_prefix = 'en' if lang == 'en' else 'es'
            newer_url = f"{SITE_URL}/{lang_prefix}/{newer['slug']}/"

            if newer_url in existing_urls or newer_url.replace('https://', 'http://') in existing_urls:
                continue

            # Calculate relevance score
            semantic_score = post_relations.get(newer['slug'], 0)
            tag_score = get_shared_tags(post, newer) * 0.3

            # Skip if no semantic or tag relationship
            relevance = semantic_score + tag_score
            if relevance < 0.1:
                continue

            candidates = extract_anchor_candidates(newer['title'])
            anchor = find_anchor_in_text(text_lower, candidates)

            if anchor and len(anchor) >= MIN_ANCHOR_LEN:
                link_candidates.append({
                    'target_slug': newer['slug'],
                    'target_title': newer['title'],
                    'anchor': anchor,
                    'url': newer_url,
                    'relevance': relevance,
                })

        # Sort by relevance (semantic + tags), then by anchor length
        link_candidates.sort(key=lambda x: (x['relevance'], len(x['anchor'])), reverse=True)
        selected = link_candidates[:MAX_LINKS_PER_POST]

        if selected:
            results.append({
                'post_id': post['id'],
                'post_slug': post['slug'],
                'post_title': post['title'],
                'post_updated_at': post['updated_at'],
                'lexical_original': post['lexical'],
                'links': selected,
            })

    return results


def apply_links(result, dry_run=True):
    """Apply links to a single post's lexical content."""
    lexical = json.loads(result['lexical_original'])
    applied = []

    for link in result['links']:
        modified = add_link_to_lexical(lexical, link['anchor'], link['url'])
        if modified:
            applied.append(link)

    if not applied:
        return 0

    if dry_run:
        print(f"\n  POST: \"{result['post_title']}\" ({result['post_slug']})")
        for link in applied:
            rel = link.get('relevance', 0)
            print(f"    + [{link['anchor']}] -> {link['target_title']}  (rel: {rel:.2f})")
        return len(applied)

    # Apply for real
    try:
        resp = api_put(
            f"/ghost/api/admin/posts/{result['post_id']}/",
            {"posts": [{
                "lexical": json.dumps(lexical),
                "updated_at": result['post_updated_at'],
            }]}
        )
        if resp.get('posts'):
            print(f"  OK: \"{result['post_title']}\" - {len(applied)} links added")
            return len(applied)
        else:
            print(f"  ERROR on {result['post_slug']}: {json.dumps(resp)[:200]}")
            return 0
    except Exception as e:
        print(f"  ERROR on {result['post_slug']}: {e}")
        return 0


def main():
    dry_run = '--dry-run' in sys.argv or '--apply' not in sys.argv
    limit = None
    for arg in sys.argv:
        if arg.startswith('--limit'):
            limit = int(sys.argv[sys.argv.index(arg) + 1])

    mode = "DRY RUN" if dry_run else "APPLYING CHANGES"
    print(f"=== 421 Post Interlinking ({mode}) ===\n")

    if not dry_run:
        # Create backup directory
        os.makedirs(BACKUP_DIR, exist_ok=True)

    print("Fetching all posts...")
    posts = fetch_all_posts()
    print(f"  Total: {len(posts)} posts\n")

    print("Computing link opportunities...")
    results = compute_links(posts)
    print(f"  Found {len(results)} posts with link opportunities\n")

    if limit:
        results = results[:limit]
        print(f"  (Limited to {limit} posts)\n")

    if not dry_run:
        # Backup
        backup_file = os.path.join(BACKUP_DIR, f'lexical-backup-{int(time.time())}.json')
        backup_data = {r['post_slug']: r['lexical_original'] for r in results}
        with open(backup_file, 'w') as f:
            json.dump(backup_data, f)
        print(f"  Backup saved to {backup_file}\n")

    total_links = 0
    modified_posts = 0
    for result in results:
        n = apply_links(result, dry_run=dry_run)
        if n > 0:
            total_links += n
            modified_posts += 1
        if not dry_run and n > 0:
            time.sleep(0.5)  # Rate limit

    print(f"\n{'Would modify' if dry_run else 'Modified'} {modified_posts} posts with {total_links} total links")

    if dry_run:
        print(f"\nTo apply, run: python3 {sys.argv[0]} --apply")


if __name__ == '__main__':
    main()
