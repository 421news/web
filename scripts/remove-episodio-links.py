#!/usr/bin/env python3
"""Remove all internal links that use 'episodio' as anchor text from Ghost posts."""

import json
import jwt
import time
import urllib.request
import urllib.error
import ssl
import re
import os

GHOST_URL = 'https://421bn.ghost.io'
ADMIN_KEY = os.environ.get('GHOST_ADMIN_API_KEY', '')

ctx = ssl.create_default_context()


def get_token():
    key_id, secret = ADMIN_KEY.split(':')
    iat = int(time.time())
    payload = {'iat': iat, 'exp': iat + 300, 'aud': '/admin/'}
    return jwt.encode(payload, bytes.fromhex(secret), algorithm='HS256',
                      headers={'kid': key_id})


def fetch_all_posts():
    """Fetch all posts from Admin API with pagination."""
    all_posts = []
    page = 1
    while True:
        token = get_token()
        url = f'{GHOST_URL}/ghost/api/admin/posts/?limit=100&page={page}&formats=lexical'
        req = urllib.request.Request(url, headers={'Authorization': f'Ghost {token}'})
        with urllib.request.urlopen(req, context=ctx) as resp:
            data = json.loads(resp.read())
        posts = data.get('posts', [])
        if not posts:
            break
        all_posts.extend(posts)
        pagination = data.get('meta', {}).get('pagination', {})
        if not pagination.get('next'):
            break
        page = pagination['next']
    return all_posts


def update_post(post_id, lexical, updated_at):
    """Update a post's lexical content."""
    token = get_token()
    payload = json.dumps({'posts': [{'lexical': lexical, 'updated_at': updated_at}]}).encode()
    url = f'{GHOST_URL}/ghost/api/admin/posts/{post_id}/'
    req = urllib.request.Request(url, data=payload, method='PUT', headers={
        'Authorization': f'Ghost {token}',
        'Content-Type': 'application/json',
    })
    with urllib.request.urlopen(req, context=ctx) as resp:
        return json.loads(resp.read())['posts'][0]


def remove_episodio_links(lexical):
    """
    Walk Lexical JSON and remove link nodes where the anchor text is 'episodio' (case-insensitive).
    Replaces the link node with its text child (unwraps the link).
    Returns (modified_lexical, count_removed).
    """
    removed = 0

    def process_children(children):
        nonlocal removed
        new_children = []
        for node in children:
            if node.get('type') == 'link':
                # Check if this link's text is "episodio"
                link_text = ''.join(
                    c.get('text', '') for c in node.get('children', [])
                    if c.get('type') in ('text', 'extended-text')
                )
                if re.match(r'^episodios?$', link_text.strip(), re.IGNORECASE):
                    # Unwrap: replace link with its text children
                    removed += 1
                    for child in node.get('children', []):
                        new_children.append(child)
                    continue
            # Recurse into children
            if 'children' in node:
                node['children'] = process_children(node['children'])
            new_children.append(node)
        return new_children

    root = lexical.get('root', lexical)
    if 'children' in root:
        root['children'] = process_children(root['children'])

    return lexical, removed


if __name__ == '__main__':
    print('Fetching all posts...')
    posts = fetch_all_posts()
    print(f'Found {len(posts)} posts\n')

    fixed = 0
    errors = 0

    for post in posts:
        lexical_str = post.get('lexical', '')
        if not lexical_str:
            continue

        try:
            lexical = json.loads(lexical_str)
        except (json.JSONDecodeError, TypeError):
            continue

        new_lexical, count = remove_episodio_links(lexical)

        if count > 0:
            print(f'  {post["slug"]}: removing {count} "episodio" link(s)')
            try:
                new_lexical_str = json.dumps(new_lexical)
                result = update_post(post['id'], new_lexical_str, post['updated_at'])
                print(f'    OK')
                fixed += 1
            except urllib.error.HTTPError as e:
                body = e.read().decode()
                print(f'    ERROR {e.code}: {body[:200]}')
                errors += 1
            time.sleep(0.3)

    print(f'\nDone: {fixed} posts fixed, {errors} errors')
