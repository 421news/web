#!/usr/bin/env python3
"""
Import Juan Ruocco's articles from nuso.org into Ghost CMS.
Fetches raw HTML, extracts article body from <div id="body">, cleans it,
adds disclaimer, publishes as draft.
"""

import json
import jwt
import time
import re
import sys
from urllib.request import Request, urlopen
from urllib.parse import urljoin
import os

# Ghost config
GHOST_URL = 'https://421bn.ghost.io'
ADMIN_KEY = os.environ.get('GHOST_ADMIN_API_KEY', '')
AUTHOR_ID = '66ce429421c1a70001f25110'  # Juan Ruocco

ARTICLES = [
    {
        'url': 'https://nuso.org/articulo/302-meme/',
        'slug': 'meme-vector-de-ideas-ecosistemas-digitales',
        'date': '2022-11-01T12:00:00.000Z',
        'nuso_date': 'noviembre-diciembre 2022',
        'nuso_issue': 'Nueva Sociedad Nº 302',
    },
    {
        'url': 'https://nuso.org/articulo/qanon-una-conspiracion-todas-las-conspiraciones/',
        'slug': 'qanon-una-conspiracion-todas-las-conspiraciones',
        'date': '2021-01-15T12:00:00.000Z',
        'nuso_date': 'enero 2021',
        'nuso_issue': 'Nueva Sociedad',
    },
    {
        'url': 'https://nuso.org/articulo/criptomonedas-para-dummies/',
        'slug': 'criptomonedas-para-dummies-bitcoin',
        'date': '2020-11-01T12:00:00.000Z',
        'nuso_date': 'noviembre 2020',
        'nuso_issue': 'Nueva Sociedad',
    },
    {
        'url': 'https://nuso.org/articulo/como-la-extrema-derecha-se-apodero-de-4chan/',
        'slug': 'como-la-extrema-derecha-se-apodero-de-4chan-nuso',
        'date': '2020-03-01T12:00:00.000Z',
        'nuso_date': 'marzo-abril 2020',
        'nuso_issue': 'Nueva Sociedad Nº 286',
    },
    {
        'url': 'https://nuso.org/articulo/videojuegos-industria-politica-y-entretenimiento/',
        'slug': 'videojuegos-industria-politica-entretenimiento',
        'date': '2020-03-01T12:00:00.000Z',
        'nuso_date': 'marzo 2020',
        'nuso_issue': 'Nueva Sociedad',
    },
]


def get_token():
    key_id, secret = ADMIN_KEY.split(':')
    iat = int(time.time())
    payload = {'iat': iat, 'exp': iat + 300, 'aud': '/admin/'}
    return jwt.encode(payload, bytes.fromhex(secret), algorithm='HS256',
                      headers={'kid': key_id})


def fetch_html(url):
    """Fetch raw HTML from a URL."""
    req = Request(url, headers={
        'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36'
    })
    with urlopen(req, timeout=30) as resp:
        return resp.read().decode('utf-8')


def extract_body(html):
    """Extract article body from nuso.org HTML.

    The body is inside <div class="body " id="body"> and contains <p> tags
    with <span class="s1"> wrappers. We extract all content between the
    body div and the next major section.
    """
    # Find the body div by id="body"
    match = re.search(r'<div[^>]*id="body"[^>]*>', html)
    if not match:
        return None

    start = match.end()

    # Collect all <p> and heading tags from the body section
    # Stop at footnotes div or similar section markers
    body_html = html[start:]

    # Extract paragraphs and headings
    parts = []
    for m in re.finditer(r'<(p|h[1-6]|blockquote|ul|ol)[^>]*>(.*?)</\1>', body_html, re.DOTALL):
        tag = m.group(1)
        content = m.group(2).strip()
        if not content or content == '<span class="s1"></span>':
            continue
        # Clean span wrappers
        content = re.sub(r'<span[^>]*>', '', content)
        content = re.sub(r'</span>', '', content)
        # Clean Apple-converted-space
        content = re.sub(r'<span[^>]*>(&nbsp;| )</span>', ' ', content)
        content = content.replace('&nbsp;', ' ')
        # Clean empty tags
        content = re.sub(r'<(?:span|div)>\s*</(?:span|div)>', '', content)
        content = content.strip()
        if content:
            parts.append(f'<{tag}>{content}</{tag}>')

    return '\n\n'.join(parts)


def extract_title(html):
    """Extract article title from og:title, removing ' | Nueva Sociedad'."""
    match = re.search(r'<meta[^>]*property="og:title"[^>]*content="([^"]*)"', html)
    if match:
        title = match.group(1).strip()
        title = re.sub(r'\s*\|\s*Nueva Sociedad\s*$', '', title)
        return title
    return ''


def extract_subtitle(html):
    """Extract article subtitle/bajada from og:description."""
    match = re.search(r'<meta[^>]*property="og:description"[^>]*content="([^"]*)"', html)
    if match:
        return match.group(1).strip()
    return ''


def extract_feature_image(html):
    """Extract feature image URL from og:image."""
    match = re.search(r'<meta[^>]*property="og:image"[^>]*content="([^"]*)"', html)
    if match:
        return match.group(1).strip()
    return ''


def clean_body(html, base_url):
    """Clean extracted body HTML for Ghost native rendering."""
    # Fix relative URLs
    html = re.sub(r'href="(/[^"]*)"', lambda m: f'href="{urljoin(base_url, m.group(1))}"', html)
    # Remove target="_blank" (Ghost handles this)
    html = re.sub(r'\s*target="_blank"', '', html)
    # Convert <p><strong>Title text</strong></p> to <h2> (nuso uses bold paragraphs as headings)
    html = re.sub(
        r'<p><strong>((?:(?!</strong>).)+)</strong></p>',
        lambda m: f'<h2>{m.group(1)}</h2>' if len(re.sub(r"<[^>]+>", "", m.group(1))) > 5 else f'<p><strong>{m.group(1)}</strong></p>',
        html
    )
    # Also convert bold paragraphs that start with ¿ (question headings)
    html = re.sub(
        r'<p><strong>(¿[^<]+\?)</strong></p>',
        r'<h2>\1</h2>',
        html
    )
    # Normalize whitespace
    html = re.sub(r'\n\s*\n\s*\n', '\n\n', html)
    return html.strip()


def extract_footnotes(html):
    """Extract footnotes from the article if present."""
    # nuso.org uses inline footnote references like <a ... @click="...">1</a>
    # and footnote content in data attributes or separate sections
    # For now, we look for a footnotes pattern
    footnotes = []
    for m in re.finditer(r'<li[^>]*value="(\d+)"[^>]*>(.*?)</li>', html, re.DOTALL):
        num = m.group(1)
        text = re.sub(r'<[^>]+>', '', m.group(2)).strip()
        if text:
            footnotes.append(f'{num}. {text}')

    # Also try to find footnotes in the footnote-content divs
    if not footnotes:
        for m in re.finditer(r'nota_al_pie[^"]*"[^>]*>.*?<p[^>]*>(.*?)</p>', html, re.DOTALL):
            text = re.sub(r'<[^>]+>', '', m.group(1)).strip()
            if text:
                footnotes.append(text)

    return footnotes


def make_disclaimer(article):
    """Create the disclaimer HTML block."""
    return f'''<hr>
<p><em>Este artículo fue publicado originalmente en <strong><a href="{article['url']}">{article['nuso_issue']}</a></strong> ({article['nuso_date']}). Se reproduce aquí con autorización del autor.</em></p>'''


def create_post(token, article, html_content, title, subtitle, feature_image):
    """Create a draft post in Ghost using the html field.

    Ghost converts html to native Lexical nodes (paragraphs, headings, etc.)
    instead of wrapping in a single HTML card.
    """
    full_html = html_content + make_disclaimer(article)

    post_data = {
        'posts': [{
            'title': title,
            'slug': article['slug'],
            'html': full_html,
            'status': 'draft',
            'authors': [{'id': AUTHOR_ID}],
            'tags': [{'name': '#es'}],
            'published_at': article['date'],
            'custom_excerpt': subtitle[:300] if subtitle else None,
            'feature_image': feature_image if feature_image else None,
        }]
    }

    data = json.dumps(post_data).encode('utf-8')
    req = Request(
        f'{GHOST_URL}/ghost/api/admin/posts/?source=html',
        data=data,
        headers={
            'Authorization': f'Ghost {token}',
            'Content-Type': 'application/json',
        },
        method='POST'
    )

    with urlopen(req, timeout=30) as resp:
        result = json.loads(resp.read().decode('utf-8'))
        return result['posts'][0]


def delete_post(token, post_id):
    """Delete a post by ID."""
    req = Request(
        f'{GHOST_URL}/ghost/api/admin/posts/{post_id}/',
        headers={'Authorization': f'Ghost {token}'},
        method='DELETE'
    )
    with urlopen(req, timeout=30) as resp:
        return resp.status


def main():
    # Check for --delete-previous flag to clean up failed attempts
    delete_ids = []
    if '--delete' in sys.argv:
        idx = sys.argv.index('--delete')
        delete_ids = sys.argv[idx+1:]

    token = get_token()

    if delete_ids:
        for pid in delete_ids:
            try:
                status = delete_post(token, pid)
                print(f"Deleted {pid}: {status}")
            except Exception as e:
                print(f"Failed to delete {pid}: {e}")
        return

    for i, article in enumerate(ARTICLES):
        print(f"\n[{i+1}/{len(ARTICLES)}] Fetching: {article['url']}")

        try:
            raw_html = fetch_html(article['url'])

            title = extract_title(raw_html)
            subtitle = extract_subtitle(raw_html)
            feature_image = extract_feature_image(raw_html)

            print(f"  Title: {title}")
            print(f"  Subtitle: {subtitle[:80]}..." if len(subtitle) > 80 else f"  Subtitle: {subtitle}")

            body = extract_body(raw_html)

            if not body or len(body) < 500:
                print(f"  WARNING: Body too short ({len(body) if body else 0} chars)")
                with open(f'/tmp/nuso-debug-{i}.html', 'w') as f:
                    f.write(raw_html)
                print(f"  Saved debug HTML to /tmp/nuso-debug-{i}.html")
                continue

            body = clean_body(body, article['url'])

            # Add footnotes if found
            footnotes = extract_footnotes(raw_html)
            if footnotes:
                body += '\n\n<hr>\n<p><strong>Notas</strong></p>\n'
                body += '\n'.join(f'<p><small>{fn}</small></p>' for fn in footnotes)

            print(f"  Body: {len(body)} chars, {body.count('<p>')} paragraphs")

            post = create_post(token, article, body, title, subtitle, feature_image)
            print(f"  Created draft: {post['title']} (id: {post['id']})")

        except Exception as e:
            print(f"  ERROR: {e}")
            import traceback
            traceback.print_exc()

    print("\nDone!")


if __name__ == '__main__':
    main()
