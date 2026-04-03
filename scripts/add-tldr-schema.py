#!/usr/bin/env python3
"""Add TL;DR abstracts and DefinedTerm schema to 10 core posts via Ghost Admin API."""

import json
import time
import urllib.request
import urllib.error
import hashlib
import hmac
import struct
import base64
from datetime import datetime, timezone

# Ghost Admin API config
GHOST_HOST = "https://421bn.ghost.io"
ADMIN_KEY = "680be497f896280001455172:50f2d88ff42197eb96adf838b5c4b4baccc3ff6ff2e7772390b16ca4bcc6d967"
KID, SECRET_HEX = ADMIN_KEY.split(":")
SECRET = bytes.fromhex(SECRET_HEX)


def make_jwt():
    """Create a HS256 JWT for Ghost Admin API."""
    now = int(time.time())
    header = base64.urlsafe_b64encode(json.dumps({"alg": "HS256", "kid": KID, "typ": "JWT"}).encode()).rstrip(b"=")
    payload = base64.urlsafe_b64encode(json.dumps({"iat": now, "exp": now + 300, "aud": "/admin/"}).encode()).rstrip(b"=")
    signing_input = header + b"." + payload
    signature = base64.urlsafe_b64encode(hmac.new(SECRET, signing_input, hashlib.sha256).digest()).rstrip(b"=")
    return (signing_input + b"." + signature).decode()


def api_get(path):
    """GET from Ghost Admin API."""
    token = make_jwt()
    req = urllib.request.Request(
        f"{GHOST_HOST}/ghost/api/admin/{path}",
        headers={"Authorization": f"Ghost {token}", "Content-Type": "application/json"}
    )
    with urllib.request.urlopen(req) as resp:
        return json.loads(resp.read())


def api_put(path, data):
    """PUT to Ghost Admin API."""
    token = make_jwt()
    body = json.dumps(data).encode()
    req = urllib.request.Request(
        f"{GHOST_HOST}/ghost/api/admin/{path}",
        data=body,
        headers={"Authorization": f"Ghost {token}", "Content-Type": "application/json"},
        method="PUT"
    )
    with urllib.request.urlopen(req) as resp:
        return json.loads(resp.read())


def find_post_by_slug(slug):
    """Find a post by slug."""
    data = api_get(f"posts/slug/{slug}/?formats=lexical")
    return data["posts"][0]


def make_tldr_paragraph(text):
    """Create a lexical paragraph node with bold text."""
    return {
        "type": "paragraph",
        "direction": "ltr",
        "format": "",
        "indent": 0,
        "version": 1,
        "children": [
            {
                "type": "extended-text",
                "detail": 0,
                "format": 1,
                "mode": "normal",
                "style": "",
                "text": text,
                "version": 1
            }
        ]
    }


def make_defined_term_script(name, alternate_name, description):
    """Create DefinedTerm JSON-LD script tag."""
    schema = {"@context": "https://schema.org", "@type": "DefinedTerm", "name": name}
    if alternate_name:
        schema["alternateName"] = alternate_name
    schema["description"] = description
    schema["inDefinedTermSet"] = {"@type": "DefinedTermSet", "name": "421.news Concepts"}
    return f'<script type="application/ld+json">{json.dumps(schema, ensure_ascii=False)}</script>'


# The 10 posts
POSTS = [
    {
        "slug": "soberania-cognitiva-introduccion-autonomia-psiquica",
        "tldr": "La soberan\u00eda cognitiva es la capacidad de una persona, comunidad o naci\u00f3n de controlar su propio conocimiento, atenci\u00f3n y procesos de toma de decisiones. En una era de algoritmos dise\u00f1ados para captar tu atenci\u00f3n e informaci\u00f3n infinita compitiendo por tu mente, este ensayo propone un marco para resistir la manipulaci\u00f3n informativa y recuperar la autonom\u00eda ps\u00edquica.",
        "defined_term": ("Soberan\u00eda cognitiva", "Cognitive sovereignty", "The capacity to control one's own knowledge, attention, and decision-making processes, resisting informational manipulation.")
    },
    {
        "slug": "low-tech-high-life-cottagecore-cyberpunk",
        "tldr": "Low Tech, High Life es una filosof\u00eda que propone evaluar los costos, beneficios y demandas de las tecnolog\u00edas que usamos a diario, eligiendo la simplicidad y la autonom\u00eda por sobre la hiperconectividad. Un reverso al cyberpunk que rescata el cottagecore, el solarpunk y la vida anal\u00f3gica como formas de resistencia al tecno-optimismo acr\u00edtico.",
        "defined_term": ("Low Tech High Life", None, "A counter-cyberpunk philosophy of choosing simplicity, intentionality, and autonomy over hyper-connectivity.")
    },
    {
        "slug": "nick-land-aceleracionismo",
        "tldr": "Nick Land es el fil\u00f3sofo brit\u00e1nico que fund\u00f3 el aceleracionismo, una corriente de pensamiento que propone que la \u00fanica salida al capitalismo es acelerarlo hasta su colapso. Este ensayo recorre su obra, desde la Unidad de Investigaci\u00f3n de Cultura Cibern\u00e9tica (CCRU) hasta la Ilustraci\u00f3n Oscura, pasando por la hiperstici\u00f3n y el antihumanismo radical.",
        "defined_term": ("Aceleracionismo", "Accelerationism", "A philosophical current proposing that the only way out of capitalism is to accelerate it to collapse. Founded by Nick Land.")
    },
    {
        "slug": "ingenieria-inversa-a-la-mierdificacion-de-internet",
        "tldr": "La mierdificaci\u00f3n (enshittification) es el proceso por el cual las plataformas digitales degradan sistem\u00e1ticamente la experiencia del usuario para maximizar ganancias. Este art\u00edculo propone la ingenier\u00eda inversa como modo de resistencia: entender los mecanismos de degradaci\u00f3n para desarmarlos, con aportes de Cory Doctorow y herramientas pr\u00e1cticas.",
        "defined_term": ("Mierdificaci\u00f3n", "Enshittification", "The systematic degradation of digital platforms to maximize profits at users' expense. Term by Cory Doctorow, framework by 421.")
    },
    {
        "slug": "volverse-ingobernable-peter-sloterdijk",
        "tldr": "Peter Sloterdijk propone que el ser humano ha sido domesticado por sus propias instituciones, y que la antropot\u00e9cnica \u2014el conjunto de pr\u00e1cticas con las que nos auto-modificamos\u2014 es el campo de batalla fundamental de nuestra \u00e9poca. Este ensayo explora c\u00f3mo volverse ingobernable a trav\u00e9s del pensamiento del fil\u00f3sofo alem\u00e1n, conectando con Nietzsche y la biopol\u00edtica contempor\u00e1nea.",
        "defined_term": ("Antropot\u00e9cnica", "Anthropotechnics", "The set of practices through which humans self-modify and self-domesticate. Concept by Peter Sloterdijk.")
    },
    {
        "slug": "ya-pagas-internet-no-pagues-por-lo-demas",
        "tldr": "Si ya pag\u00e1s una conexi\u00f3n a internet, ten\u00e9s acceso a un ecosistema de herramientas libres para conseguir m\u00fasica, libros, pel\u00edculas, videojuegos y software sin pagar suscripciones adicionales. Gu\u00eda pr\u00e1ctica y actualizada sobre BitTorrent, Soulseek, eMule y alternativas gratuitas a los servicios de streaming, con foco en Argentina y Latinoam\u00e9rica.",
        "defined_term": None
    },
    {
        "slug": "la-trampa-de-la-cultura-joven",
        "tldr": "La cultura joven es una construcci\u00f3n que atrapa a las generaciones en un ciclo de nostalgia e identidad congelada, mientras el mercado capitaliza cada micro-generaci\u00f3n con productos dise\u00f1ados para sus recuerdos. Este ensayo analiza c\u00f3mo internet, la pandemia, el home office y el entretenimiento digital transformaron la juventud en un commodity.",
        "defined_term": None
    },
    {
        "slug": "selfhosting-alojar-nube-hogarena",
        "tldr": "El selfhosting es la pr\u00e1ctica de alojar tus propios servicios digitales (nube, email, streaming) en hardware que control\u00e1s, eliminando la dependencia de Google, Apple y otras plataformas. Gu\u00eda para principiantes que cubre qu\u00e9 hardware necesit\u00e1s, qu\u00e9 software usar y c\u00f3mo migrar tu vida digital a una infraestructura propia.",
        "defined_term": ("Selfhosting", None, "The practice of hosting your own digital services on hardware you control, eliminating dependence on Big Tech platforms.")
    },
    {
        "slug": "hipersticiones-cognitohazard-futuro",
        "tldr": "Una hiperstici\u00f3n es una ficci\u00f3n que se hace real por el solo hecho de ser cre\u00edda: una profec\u00eda autocumplida con motor cultural. Este art\u00edculo explora c\u00f3mo las narrativas sobre el futuro \u2014desde la filosof\u00eda de Derrida y Fisher hasta los memes de 4chan\u2014 infectan el presente y moldean la realidad a trav\u00e9s de cognitohazards informacionales.",
        "defined_term": ("Hiperstici\u00f3n", "Hyperstition", "A fiction that makes itself real by being believed. A self-fulfilling cultural prophecy. Concept from the CCRU.")
    },
    {
        "slug": "guia-cyberciruja-para-la-autodeterminacion-digital",
        "tldr": "Un cyberciruja es alguien que recupera, reutiliza y hackea tecnolog\u00eda descartada para construir su propia infraestructura digital aut\u00f3noma. Esta gu\u00eda presenta las herramientas, pr\u00e1cticas y filosof\u00eda necesarias para lograr autodeterminaci\u00f3n digital: controlar tus dispositivos, tus datos y tu presencia online sin depender de corporaciones.",
        "defined_term": ("Cyberciruja", None, "Someone who recovers, reuses, and hacks discarded technology to build autonomous digital infrastructure. A framework for digital self-determination.")
    },
]


def process_post(post_config):
    slug = post_config["slug"]
    tldr = post_config["tldr"]
    defined_term = post_config["defined_term"]

    print(f"\n{'='*60}")
    print(f"Processing: {slug}")

    # Fetch post
    post = find_post_by_slug(slug)
    post_id = post["id"]
    updated_at = post["updated_at"]
    print(f"  ID: {post_id}")
    print(f"  Title: {post['title']}")

    # Parse lexical
    lexical = json.loads(post["lexical"])

    # Check if TL;DR already added (check first child text)
    first_child = lexical["root"]["children"][0] if lexical["root"]["children"] else None
    if first_child and first_child.get("type") == "paragraph":
        first_text = ""
        for c in first_child.get("children", []):
            first_text += c.get("text", "")
        if "soberan" in first_text.lower()[:50] and slug == "soberania-cognitiva-introduccion-autonomia-psiquica":
            # Could be existing content, check more carefully
            pass
        if first_text.startswith(tldr[:30]):
            print(f"  SKIP: TL;DR already present")
            return

    # Insert TL;DR as first paragraph
    tldr_node = make_tldr_paragraph(tldr)
    lexical["root"]["children"].insert(0, tldr_node)
    print(f"  Added TL;DR paragraph")

    # Build codeinjection_head
    existing_head = post.get("codeinjection_head") or ""
    if defined_term:
        name, alt_name, desc = defined_term
        script_tag = make_defined_term_script(name, alt_name, desc)
        # Check if already added
        if "DefinedTerm" in existing_head and name in existing_head:
            print(f"  SKIP: DefinedTerm already in codeinjection_head")
            new_head = existing_head
        else:
            new_head = existing_head + "\n" + script_tag if existing_head else script_tag
            print(f"  Added DefinedTerm schema for: {name}")
    else:
        new_head = existing_head
        print(f"  No DefinedTerm for this post")

    # Re-fetch to get fresh updated_at
    time.sleep(0.5)
    post = find_post_by_slug(slug)
    updated_at = post["updated_at"]

    # PUT update
    update_data = {
        "posts": [{
            "lexical": json.dumps(lexical, ensure_ascii=False),
            "codeinjection_head": new_head if new_head else None,
            "updated_at": updated_at
        }]
    }

    result = api_put(f"posts/{post_id}/", update_data)
    print(f"  Updated successfully!")
    time.sleep(0.5)


def main():
    print("Adding TL;DR abstracts and DefinedTerm schema to 10 core posts")
    print(f"Time: {datetime.now().isoformat()}")

    for i, post_config in enumerate(POSTS):
        print(f"\n[{i+1}/10]", end="")
        try:
            process_post(post_config)
        except urllib.error.HTTPError as e:
            body = e.read().decode() if e.fp else ""
            print(f"  ERROR {e.code}: {body[:300]}")
        except Exception as e:
            print(f"  ERROR: {e}")

    print(f"\n{'='*60}")
    print("Done!")


if __name__ == "__main__":
    main()
