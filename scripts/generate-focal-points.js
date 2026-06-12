#!/usr/bin/env node
/**
 * generate-focal-points.js
 * --------------------------------------------------------------------------
 * Calcula el "focal point" (punto más importante) de cada feature image de
 * 421 usando Claude vision, y genera assets/data/feature-focal.json:
 *
 *   { "2026/06/foo.webp": "47% 55%", ... }
 *
 * El theme (focal-points.js) lee ese JSON y aplica `object-position` a las
 * imágenes con object-fit:cover (hero full-bleed, home mobile, cards, header
 * destacado). NO cambia ningún aspect ratio — solo decide qué parte de la
 * foto sobrevive al recorte. Fallback: si una imagen no está en el JSON, el
 * theme usa centro (comportamiento actual), así que nunca hay regresión.
 *
 * Uso:
 *   node generate-focal-points.js                 # todas las imágenes nuevas (Sonnet)
 *   node generate-focal-points.js --model haiku   # usar Haiku 4.5 (mitad de precio)
 *   node generate-focal-points.js --limit 10      # procesar solo 10 (test)
 *   node generate-focal-points.js --force         # recalcular también las ya hechas
 *
 * Es incremental: por defecto saltea las imágenes que ya están en el JSON,
 * así que re-correrlo solo procesa las nuevas. Deduplica por imagen (596
 * únicas entre ~1455 posts), nunca consulta la misma foto dos veces.
 * --------------------------------------------------------------------------
 */
const fs = require('fs');
const path = require('path');

// ---- config ----
const CONTENT_KEY = '420da6f85b5cc903b347de9e33';
const GHOST_HOST = '421bn.ghost.io';
const RESIZE_BASE = 'https://www.421.news/content/images/size/w800/'; // versión liviana
const OUT_PATH = path.join(__dirname, '..', 'assets', 'data', 'feature-focal.json');
const CONCURRENCY = 5;

const MODELS = { sonnet: 'claude-sonnet-4-6', haiku: 'claude-haiku-4-5' };
const argv = process.argv.slice(2);
const getArg = (name) => { const i = argv.indexOf(name); return i >= 0 ? argv[i + 1] : null; };
const MODEL = MODELS[getArg('--model')] || MODELS.sonnet;
const LIMIT = getArg('--limit') ? parseInt(getArg('--limit'), 10) : Infinity;
const FORCE = argv.includes('--force');

// ---- API key desde 421-web/.env ----
const envTxt = fs.readFileSync(path.join(__dirname, '..', '.env'), 'utf8');
const KEY = (envTxt.match(/ANTHROPIC_API_KEY=(.+)/) || [])[1]?.trim();
if (!KEY) { console.error('Falta ANTHROPIC_API_KEY en 421-web/.env'); process.exit(1); }

const PROMPT = `Esta imagen es la foto de portada de un artículo. Se va a recortar a formatos más angostos y cuadrados (vertical y casi-cuadrado, además de full-screen en distintas pantallas) usando object-fit: cover, que recorta los costados y a veces arriba/abajo.

Identificá el SUJETO MÁS IMPORTANTE de la foto a nivel semántico: aquello de lo que realmente trata la imagen (una persona concreta, un objeto, un cuadro, un rostro, el foco de acción). No el área de mayor contraste, sino el tema.

Devolvé SOLO un objeto JSON, sin texto extra, con el punto que SIEMPRE debe quedar visible al recortar:
{"fx": <entero 0-100, posición horizontal en %>, "fy": <entero 0-100, posición vertical en %>}`;

// ---- helpers ----
function focalKey(url) {
  const i = url.indexOf('/content/images/');
  if (i < 0) return null;
  let p = url.slice(i + '/content/images/'.length).replace(/^size\/[^/]+\//, '');
  return p.split('?')[0];
}
function mediaType(key) {
  const ext = key.split('.').pop().toLowerCase();
  if (ext === 'png') return 'image/png';
  if (ext === 'webp') return 'image/webp';
  if (ext === 'gif') return 'image/gif';
  return 'image/jpeg';
}

async function fetchAllImageKeys() {
  const map = new Map(); // key -> original feature_image url (primera vista)
  let page = 1;
  while (true) {
    const r = await fetch(`https://${GHOST_HOST}/ghost/api/content/posts/?key=${CONTENT_KEY}&limit=100&page=${page}&fields=feature_image`);
    const j = await r.json();
    const posts = j.posts || [];
    if (!posts.length) break;
    for (const p of posts) {
      if (!p.feature_image) continue;
      const k = focalKey(p.feature_image);
      if (k && !map.has(k)) map.set(k, p.feature_image);
    }
    if (!j.meta?.pagination || page >= j.meta.pagination.pages) break;
    page++;
  }
  return map;
}

async function focalForImage(key) {
  // bajar versión liviana (w800); si falla, original guardado
  const url = RESIZE_BASE + key;
  const res = await fetch(url, { redirect: 'follow' });
  if (!res.ok) throw new Error('img HTTP ' + res.status);
  const buf = Buffer.from(await res.arrayBuffer());
  const b64 = buf.toString('base64');

  const ai = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 100,
      messages: [{ role: 'user', content: [
        { type: 'image', source: { type: 'base64', media_type: mediaType(key), data: b64 } },
        { type: 'text', text: PROMPT },
      ]}],
    }),
  });
  const j = await ai.json();
  if (!j.content) throw new Error('AI ' + JSON.stringify(j).slice(0, 160));
  const txt = j.content[0].text.trim().replace(/^```json?/i, '').replace(/```$/, '').trim();
  const o = JSON.parse(txt);
  const fx = Math.round(Math.min(95, Math.max(5, o.fx)));
  const fy = Math.round(Math.min(95, Math.max(5, o.fy)));
  return `${fx}% ${fy}%`;
}

(async () => {
  console.log(`Modelo: ${MODEL}`);
  const existing = (!FORCE && fs.existsSync(OUT_PATH))
    ? JSON.parse(fs.readFileSync(OUT_PATH, 'utf8')) : {};
  const result = { ...existing };

  const allKeys = await fetchAllImageKeys();
  let todo = [...allKeys.keys()].filter((k) => FORCE || !(k in existing));
  todo = todo.slice(0, LIMIT);
  console.log(`Imágenes únicas: ${allKeys.size} | ya hechas: ${Object.keys(existing).length} | a procesar: ${todo.length}`);
  if (!todo.length) { console.log('Nada nuevo.'); return; }

  let done = 0, failed = 0, i = 0;
  async function worker() {
    while (i < todo.length) {
      const key = todo[i++];
      try {
        result[key] = await focalForImage(key);
        done++;
        if (done % 20 === 0 || done === todo.length) console.log(`  ${done}/${todo.length}  (${key} → ${result[key]})`);
      } catch (e) {
        failed++;
        console.log(`  ⚠ ${key}: ${e.message}`);
      }
      // guardar incrementalmente cada 25 por si se corta
      if ((done + failed) % 25 === 0) writeOut(result);
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  writeOut(result);
  console.log(`\n✓ Listo. ${done} nuevas, ${failed} fallidas. Total en JSON: ${Object.keys(result).length}`);
  console.log(`→ ${OUT_PATH}`);
})();

function writeOut(obj) {
  const sorted = Object.fromEntries(Object.keys(obj).sort().map((k) => [k, obj[k]]));
  fs.writeFileSync(OUT_PATH, JSON.stringify(sorted, null, 2) + '\n');
}
