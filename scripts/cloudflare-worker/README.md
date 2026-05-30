# Cloudflare Worker (SEO) — NO DESPLEGADO / INERTE

Este Worker fue pensado para resolver el ruido de assets versionados en GSC
("Crawled, currently not indexed"):

1. Servir un `/robots.txt` custom (Ghost Pro no permite override via theme).
2. Agregar `X-Robots-Tag: noindex` a `/assets/data/`, `window-manager.js/.css`.

## Estado: ABANDONADO (decisión 2026-05-30)

**No funciona y no se va a desplegar.** Un Cloudflare Worker solo corre sobre
tráfico *proxied* (nube naranja). El hostname canónico `www.421.news` está en
**DNS-only (nube gris)** → el tráfico va directo a Ghost Pro y nunca toca el
edge de Cloudflare, así que el Worker no se ejecuta. Solo el apex `421.news`
está proxied, pero ahí corre el "Managed robots.txt" de Cloudflare, no este Worker.

Proxiar `www` delante de Ghost Pro se descartó por riesgo (SSL Full strict,
caching, cookies de Portal/Stripe, SSE de comentarios).

**El problema que resolvía es cosmético**: que assets JSON/JS figuren como
"crawled, not indexed" NO afecta el ranking (Google lo confirma).

El código se conserva versionado por si algún día se decide proxiar `www`.
Antes de desplegar, releer este README y la nota de memoria
`gsc-cleanup-crawled-not-indexed-2026-05-15`.
