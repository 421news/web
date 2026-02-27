#!/usr/bin/env python3
"""
Optimize meta_title + meta_description for high-impression low-CTR posts.
Uses GSC query data to align meta fields with actual search intent.

Run: python3 scripts/optimize-meta-titles.py --dry-run
     python3 scripts/optimize-meta-titles.py --apply

Requires: pip3 install pyjwt
"""

import json, sys, time, os, urllib.request, urllib.parse
from datetime import datetime
import jwt  # pyjwt

# Ghost Admin API
GHOST_URL = "https://421bn.ghost.io"
ADMIN_KEY = os.environ.get("GHOST_ADMIN_API_KEY", "680be497f896280001455172:50f2d88ff42197eb96adf838b5c4b4baccc3ff6ff2e7772390b16ca4bcc6d967")

def make_token():
    kid, secret = ADMIN_KEY.split(":")
    return jwt.encode(
        {"iat": int(time.time()), "exp": int(time.time()) + 300, "aud": "/admin/"},
        bytes.fromhex(secret),
        algorithm="HS256",
        headers={"kid": kid}
    )

def ghost_get(path):
    req = urllib.request.Request(f"{GHOST_URL}{path}", headers={"Authorization": f"Ghost {make_token()}"})
    with urllib.request.urlopen(req) as resp:
        return json.loads(resp.read())

def ghost_put(path, data):
    body = json.dumps(data).encode()
    req = urllib.request.Request(f"{GHOST_URL}{path}", data=body, method="PUT",
                                headers={"Authorization": f"Ghost {make_token()}",
                                         "Content-Type": "application/json"})
    with urllib.request.urlopen(req) as resp:
        return json.loads(resp.read())

# ─── Optimized meta fields ───────────────────────────────────────────────────
# Based on GSC top queries for each page (90-day data, Feb 2026)
# Rules:
#   meta_title: ≤60 chars, includes primary search query, ends with | 421.news
#   meta_description: ≤155 chars, includes 2-3 top queries naturally, has CTA/hook
#   og_title: slightly longer/clickable version (≤90 chars)
#   og_description: social-optimized hook

OPTIMIZATIONS = [
    {
        "slug": "como-ver-one-piece",
        # Top queries: "one piece", "one piece sin relleno", "ver one piece sin relleno"
        # Current meta_title already good: "One Piece sin relleno: guía actualizada 2026 | 421.news"
        # Current meta_description already good
        # SKIP — already optimized
        "skip": True,
    },
    {
        "slug": "hp-lovecraft-horror-cosmico",
        # Top queries: "lovecraft" (7K impr, 0.10% CTR), "hp lovecraft" (3.8K, 0.10%), "horror cosmico" (989)
        # Current: "H.P. Lovecraft: horror cósmico y los Antiguos | 421.news" — decent but generic
        # Problem: ranking pos 3.2 for "hp lovecraft" but 0.10% CTR = title doesn't attract clicks
        "meta_title": "H.P. Lovecraft: los Antiguos y el horror cósmico | 421.news",
        "meta_description": "Un ensayo sobre Lovecraft, los Mitos de Cthulhu y el horror cósmico. Quiénes son los Antiguos, por qué la humanidad es insignificante y qué nos aterra todavía.",
        "og_title": "H.P. Lovecraft: los Mitos de Cthulhu y por qué el horror cósmico no perdió fuerza",
        "og_description": "Un ensayo sobre los Antiguos, los Mitos de Cthulhu y la anti-humanidad del horror cósmico de H.P. Lovecraft.",
    },
    {
        "slug": "demon-slayer-kimetsu-no-yaiba",
        # Top queries: "demon slayer" (4.2K impr, 0.26% CTR, pos 1.5!), "kimetsu no yaiba" (600, pos 1.6)
        # Current: "Demon Slayer (Kimetsu no Yaiba): por qué importa | 421.news"
        # Problem: position 1.5 but 0.26% CTR — people see it but don't click. Need more compelling hook
        "meta_title": "Demon Slayer: ensayo sobre Kimetsu no Yaiba | 421.news",
        "meta_description": "Un ensayo sobre Demon Slayer (Kimetsu no Yaiba) más allá de la animación. Ritos de paso, demonios internos y por qué Tanjiro define a toda una generación.",
        "og_title": "Demon Slayer y los demonios que llevamos dentro: un ensayo sobre Kimetsu no Yaiba",
        "og_description": "Más allá de la animación épica: un ensayo sobre Demon Slayer y lo que Tanjiro nos enseña sobre los demonios que todos llevamos dentro.",
    },
    {
        "slug": "juguetes-bootlegs-knock-offs-art-toys-coleccionismo",
        # Top queries: "bootleg" (10.2K, 0.12%, pos 3.6), "bootleg que es" (3K, 0.10%), "bootleg toys" (166)
        # Current: "Bootleg: qué es, tipos y guía de coleccionismo | 421.news" — already good
        # Current desc already good. Minor tweak to desc to be more specific
        "meta_title": "Bootleg: qué es, tipos y por qué se coleccionan | 421.news",
        "meta_description": "Un bootleg es una copia no oficial de un juguete o figura. Qué es un bootleg, tipos de knockoffs, cómo identificarlos y por qué coleccionistas los buscan.",
        "og_title": "Bootlegs, knockoffs y art toys: la guía completa del coleccionismo pirata",
        "og_description": "Qué es un bootleg, tipos de knockoffs y art toys, y por qué hay coleccionistas que los buscan más que a los originales.",
    },
    {
        "slug": "masacre-de-texas-leatherface-sawyer",
        # Top queries: mostly "leatherface", "masacre de texas", "sawyer" — all very low volume recently
        # Has 32K all-time impressions but queries are diluted across 100+ long-tail
        # Current: "La Masacre de Texas: guía completa de la saga | 421.news" — already good
        # Current desc already good. Keep as is.
        "skip": True,
    },
    {
        "slug": "rat-fink-big-daddy-roth-raton-segunda-guerra-mundial",
        # Top queries: "rat fink" (12K, 0.54%, pos 4.6), "ratfink" (1.6K), "rata fink" (243)
        # Current: "Rat Fink: qué es y la historia de Ed Roth | 421.news" — good
        # Current desc already good. Already covers main queries. Minor hook improvement.
        "meta_description": "Rat Fink nació del trauma de Ed \"Big Daddy\" Roth en la Segunda Guerra Mundial. Su historia conecta hot rods, contracultura, punk y arte underground.",
        "og_title": "Rat Fink: la rata que nació de la guerra y se convirtió en ícono contracultural",
        "og_description": "Ed \"Big Daddy\" Roth creó a Rat Fink como anti-Mickey Mouse. La historia conecta hot rods, la Segunda Guerra Mundial, punk y contracultura.",
    },
    {
        "slug": "pistas-skateparks-publicos-buenos-aires",
        # Top queries: "skatepark buenos aires" (451, 2.2%), "skatepark" (1.1K, 0.44%), "skatepark caba" (176)
        # Current: "Skateparks públicos en Buenos Aires: guía completa | 421.news" — good
        # Current desc already good. Skip.
        "skip": True,
    },
    {
        "slug": "trench-crusade-wargame-lore-historia",
        # Top queries: "trench crusade" (11.2K, 0.03%!, pos 4.9) — terrible CTR at great position
        # Current: "Trench Crusade: guía del wargame rival de Warhammer | 421.news" — good title
        # Problem: 0.03% CTR means the snippet/description isn't compelling enough
        "meta_title": "Trench Crusade: demonios y trincheras en español | 421.news",
        "meta_description": "Guía de Trench Crusade en español: el wargame con demonios en trincheras de la Primera Guerra Mundial. Lore, facciones, reglas y por qué compite con Warhammer.",
        "og_title": "Trench Crusade: demonios, trincheras y el wargame que le planta cara a Warhammer",
        "og_description": "Todo sobre Trench Crusade: demonios en trincheras de la Primera Guerra Mundial, facciones, lore y reglas en español.",
    },
    {
        "slug": "space-king-warhammer-40k",
        # Top queries: "space king" (6.6K, 0.33%, pos 5.1), "spaceking" (719)
        # Current: "Space King: la mejor parodia de Warhammer 40K | 421.news" — good
        # But CTR 0.33% at pos 5 is very low. Needs more hook.
        "meta_title": "Space King: parodia de Warhammer 40K en español | 421.news",
        "meta_description": "Space King es la serie animada que parodia Warhammer 40K con humor brutal. Quiénes son Don Greger y Tom Hinchliffe, episodios y por qué es imperdible.",
        "og_title": "Space King: la serie animada que mejor parodia a Warhammer 40K",
        "og_description": "Space King parodia Warhammer 40K con humor brutal y edgy. Todo sobre la serie, sus creadores y los mejores episodios.",
    },
    {
        "slug": "grand-theft-auto-iv-una-ventana-a-un-mundo-que-ya-no-existe",
        # Top queries: "gta 4" (2.8K, 1.0%, pos 5.8), "gta iv" (2K, 0.91%, pos 7.7)
        # Current: "GTA IV: por qué Grand Theft Auto 4 es un clásico | 421.news" — good
        # Desc good too. Skip.
        "skip": True,
    },
    {
        "slug": "como-hacer-fanzines-para-que-sirven",
        # Top queries: "fanzine" (105, 0.95%), "como hacer un fanzine" (68), "fanzine como hacer" (24)
        # Current meta_title = post title (not optimized!): "Fanzines: hacemos uno y te explico para qué sirven"
        # Needs: keyword-focused title
        "meta_title": "Cómo hacer un fanzine: guía paso a paso | 421.news",
        "meta_description": "Guía completa para hacer un fanzine desde cero. Qué es un fanzine, materiales, diseño, impresión y distribución. De la idea a la versión final, paso a paso.",
        "og_title": "Fanzines: guía para hacer el tuyo desde cero",
        "og_description": "De la idea a la versión final: una guía paso a paso para hacer tu propio fanzine, con materiales, diseño e impresión.",
    },
    {
        "slug": "mejores-libros-ciencia-ficcion",
        # Top queries: "ciencia ficcion" (13K impr), "libros ciencia ficcion" — huge cluster
        # Current: "Mejores libros de ciencia ficción: 40+ recomendados | 421.news" — already excellent
        # Current desc already good. Skip.
        "skip": True,
    },
    {
        "slug": "r36s-la-consola-retro-del-2025",
        # Top queries: "r36s" (14.7K, 0.57%, pos 17.3) — position too low, but meta optimization helps
        # Current: "R36S: review de la consola retro portátil de 2025 | 421.news" — good
        # Desc already good. Skip.
        "skip": True,
    },
    {
        "slug": "san-jorge-santo-matadragones",
        # Top queries: varied long-tail about San Jorge
        # Current meta_title = post title (not optimized!): "San Jorge, el santo matadragones"
        "meta_title": "San Jorge: la leyenda del santo matadragones | 421.news",
        "meta_description": "Quién fue San Jorge, la leyenda del dragón y por qué el santo matadragones sigue siendo un símbolo universal. De la Edad Media a la cultura pop.",
        "og_title": "San Jorge: la verdadera historia del santo que mató al dragón",
        "og_description": "La leyenda de San Jorge, el santo matadragones: su historia real, el enfrentamiento con el dragón y su legado de la Edad Media hasta hoy.",
    },
    {
        "slug": "vender-cartas-magic-the-gathering-precios-mercado",
        # Top queries: "magic the gathering precios", "vender cartas magic"
        # Current meta_title = post title (not optimized!): same as title, too long
        "meta_title": "Vender cartas Magic: guía de precios y mercado | 421.news",
        "meta_description": "Guía para vender cartas de Magic: The Gathering. Cómo relevar precios, manejar tu colección y operar en el mercado secundario de MTG.",
        "og_title": "Magic: The Gathering — guía definitiva para vender tus cartas",
        "og_description": "Tutorial teórico-práctico para el relevamiento de precios, manejo de colecciones y compraventa de cartas Magic en el mercado secundario.",
    },
    {
        "slug": "pop-os-linux",
        # Top queries: "pop os" (11K, 1.28%, pos 12.6)
        # Current meta_title = post title (not optimized!): "Pop! OS: una guía para instalar Linux en tu computadora"
        "meta_title": "Pop! OS: cómo instalar Linux en tu PC | 421.news",
        "meta_description": "Tutorial para instalar Pop! OS en tu computadora. Guía paso a paso de Linux: descarga, instalación, configuración y todo lo que necesitás para empezar.",
        "og_title": "Pop! OS: guía completa para instalar Linux y ganar control de tu PC",
        "og_description": "Si querés ganar control sobre tu computadora, Pop! OS es la puerta de entrada a Linux. Tutorial paso a paso desde cero.",
    },
    {
        "slug": "telefonos-android-sin-google",
        # Top queries: "android sin google" (9.8K, 0.77%, pos 7.8)
        # Current meta_title = post title (not optimized!)
        "meta_title": "Android sin Google: cómo liberar tu teléfono | 421.news",
        "meta_description": "Tutorial para usar Android sin Google. Cómo desinstalar apps de Google, instalar alternativas y liberar tu teléfono del rastreo, paso a paso en un Moto G7.",
        "og_title": "Teléfonos Android sin Google: un camino de ida hacia la privacidad",
        "og_description": "Liberar los celulares de todo el combo de Google tiene grandes beneficios. Guía práctica con un Moto G7 como ejemplo.",
    },
    {
        "slug": "godot-motor-grafico-codigo-abierto",
        # Top queries: "godot" (7.9K, 1.10%, pos 14.7)
        # Current meta_title = post title (not optimized!)
        "meta_title": "Godot Engine: el motor de videojuegos open source | 421.news",
        "meta_description": "Todo sobre Godot, el motor de videojuegos open source y argentino. Qué es, cómo funciona, por qué crece y qué rol juega en la industria indie de videojuegos.",
        "og_title": "Godot: el motor de videojuegos argentino que compite con Unity y Unreal",
        "og_description": "Godot es argentino, open source y está en plena expansión. Todo sobre el motor de videojuegos que desafía a los gigantes de la industria.",
    },
    {
        "slug": "limpieza-mantenimiento-computadoras",
        # Top queries: "limpieza computadora", "mantenimiento pc"
        # Current meta_title = post title (not optimized!)
        "meta_title": "Limpieza y mantenimiento de PC: guía completa | 421.news",
        "meta_description": "Tutorial para limpiar y mantener tu PC. Cómo limpiar cada componente, qué herramientas usar y un plan de mantenimiento para que tu computadora rinda siempre.",
        "og_title": "Guía de limpieza, orden y mantenimiento de tu PC: hazlo vos mismo",
        "og_description": "Los componentes de tu PC necesitan un service. Tutorial completo para limpiar cada pieza con lo que tenés en tu casa.",
    },
    {
        "slug": "en/absolute-dc-ultimate-marvel-comics-en",
        # Note: this is an EN post, slug includes en/ prefix — need to handle differently
        # Top queries: "dc cosmology" (207), "marvel cosmology" (224), "absolute dc vs ultimate marvel" (75)
        # Current meta is null — needs to be set
        # Actually the slug in Ghost won't have en/ prefix. Let me find it.
        "ghost_slug": "absolute-dc-ultimate-marvel-comics-en",
        "meta_title": "Absolute DC vs Ultimate Marvel: new comics era | 421.news",
        "meta_description": "Absolute DC and Ultimate Marvel are resetting superhero comics. A deep dive into DC and Marvel cosmology, the new universes and why this reboot matters.",
        "og_title": "Absolute DC vs Ultimate Marvel: two cosmologies collide",
        "og_description": "DC and Marvel are resetting their universes simultaneously. An analysis of what Absolute DC and Ultimate Marvel mean for superhero comics.",
    },
    {
        "slug": "en/mtg-arena-farm-gold-and-gems",
        # EN post — 13.7K impressions, 0.68% CTR
        "ghost_slug": "mtg-arena-farm-gold-and-gems",
        # Need to check current meta first
        "skip": True,  # Will handle separately if needed
    },
]


def run(apply=False):
    backup = []
    updated = 0
    skipped = 0

    for opt in OPTIMIZATIONS:
        if opt.get("skip"):
            skipped += 1
            continue

        slug = opt.get("ghost_slug", opt["slug"])
        print(f"\n{'='*60}")
        print(f"POST: {slug}")

        # Fetch current post
        try:
            data = ghost_get(f"/ghost/api/admin/posts/slug/{slug}/?fields=id,slug,title,meta_title,meta_description,og_title,og_description,twitter_title,twitter_description,updated_at")
            post = data["posts"][0]
        except Exception as e:
            print(f"  ERROR fetching: {e}")
            continue

        # Build update payload
        changes = {}
        fields_to_check = ["meta_title", "meta_description", "og_title", "og_description"]
        for field in fields_to_check:
            new_val = opt.get(field)
            if new_val and new_val != post.get(field):
                changes[field] = new_val

        # Also set twitter fields to match og fields if og is being changed
        if "og_title" in changes:
            changes["twitter_title"] = changes["og_title"]
        if "og_description" in changes:
            changes["twitter_description"] = changes["og_description"]

        if not changes:
            print(f"  No changes needed")
            skipped += 1
            continue

        # Show diff
        print(f"  Title: {post['title']}")
        for field, new_val in changes.items():
            old_val = post.get(field) or "(empty)"
            if old_val != new_val:
                print(f"  {field}:")
                print(f"    OLD: {old_val}")
                print(f"    NEW: {new_val}")
                # Check length
                if field == "meta_title" and len(new_val) > 60:
                    print(f"    ⚠️  WARNING: {len(new_val)} chars (max 60)")
                if field == "meta_description" and len(new_val) > 160:
                    print(f"    ⚠️  WARNING: {len(new_val)} chars (max 160)")

        if apply:
            # Save backup
            backup.append({
                "id": post["id"],
                "slug": slug,
                "original": {f: post.get(f) for f in fields_to_check + ["twitter_title", "twitter_description"]}
            })

            # Apply update
            changes["updated_at"] = post["updated_at"]
            try:
                result = ghost_put(f"/ghost/api/admin/posts/{post['id']}/", {"posts": [changes]})
                print(f"  ✅ Updated successfully")
                updated += 1
                time.sleep(0.3)  # Rate limiting (300ms as per CLAUDE.md)
            except Exception as e:
                print(f"  ❌ ERROR updating: {e}")
        else:
            print(f"  (dry run — not applied)")
            updated += 1

    print(f"\n{'='*60}")
    print(f"SUMMARY: {updated} updated, {skipped} skipped")

    if apply and backup:
        backup_path = os.path.join(os.path.dirname(__file__), "..", "backups",
                                    f"meta-backup-{datetime.now().strftime('%Y%m%d-%H%M%S')}.json")
        os.makedirs(os.path.dirname(backup_path), exist_ok=True)
        with open(backup_path, "w") as f:
            json.dump(backup, f, indent=2, ensure_ascii=False)
        print(f"Backup saved to {backup_path}")


if __name__ == "__main__":
    if "--apply" in sys.argv:
        print("🚀 APPLYING changes to Ghost Admin API...")
        run(apply=True)
    elif "--dry-run" in sys.argv or len(sys.argv) == 1:
        print("👀 DRY RUN — showing changes without applying...")
        run(apply=False)
    else:
        print("Usage: python3 optimize-meta-titles.py [--dry-run|--apply]")
