'use strict';
/**
 * Cluster de traducciones = una nota y TODAS sus versiones de idioma.
 *
 * Fuente única de la relación entre versiones. Antes el vínculo vivía en dos
 * lugares con criterios distintos (el meta english-version para ES<->EN, y el
 * prefijo de slug para las intl, derivado ad hoc en cada consumidor). Este
 * módulo es el único que decide quién es traducción de quién; server.js y el
 * backfill lo importan, nadie más re-deriva pares.
 *
 * Reglas de vínculo, en orden:
 *   ES <-> EN  : meta english-version / spanish-version del codeinjection_head.
 *   ES -> intl : prefijo de slug + tag de idioma + published_at idéntico.
 *
 * Las tres partes de la clave intl hacen falta: Ghost deduplica el slug de la
 * traducción con -2/-3, hay 33 slugs ES que ya terminan en -N, y 27 notas ES
 * comparten un published_at de una importación vieja.
 */

const LANGS = ['es', 'en', 'pt', 'fr', 'zh', 'ja', 'ko', 'tr'];
const INTL = ['pt', 'fr', 'zh', 'ja', 'ko', 'tr'];
const SITE = 'https://www.421.news';

function postLang(post) {
  const tags = (post.tags || []).map(t => t.slug);
  for (const l of LANGS) {
    if (l !== 'es' && tags.includes(`hash-${l}`)) return l;
  }
  return 'es';
}

function metaValue(head, name) {
  const m = new RegExp(`<meta\\s+name="${name}"\\s+content="([^"]+)"`).exec(head || '');
  return m ? m[1] : null;
}

/** ¿`cand` es la traducción intl de `base`? Clave compuesta, las 3 partes. */
function esTraduccionDe(cand, base) {
  if (cand.slug.indexOf(base.slug) !== 0) return false;
  if (!/^(-\d+)?$/.test(cand.slug.slice(base.slug.length))) return false;
  return cand.published_at === base.published_at;
}

/**
 * Arma el cluster de una nota ES a partir de una lista de candidatos.
 * Devuelve { members: {lang: post}, conflicts: [...] }.
 *
 * `conflicts` no es cosmético: dos posts reclamando el mismo idioma haría un
 * hreflang inválido (Google exige una sola URL por idioma). Ante colisión el
 * cluster se marca y el llamador se abstiene, igual que el apareo AMBIGUO.
 */
function clusterFrom(esPost, candidates, opts = {}) {
  const members = { es: esPost };
  const conflicts = [];
  const head = esPost.codeinjection_head || '';

  const enSlug = opts.enSlug || metaValue(head, 'english-version');
  if (enSlug) {
    const en = candidates.find(p => p.slug === enSlug && postLang(p) === 'en');
    if (en) members.en = en;
  }

  for (const cand of candidates) {
    const lang = postLang(cand);
    if (!INTL.includes(lang)) continue;
    if (!esTraduccionDe(cand, esPost)) continue;
    if (members[lang] && members[lang].id !== cand.id) {
      conflicts.push({ lang, a: members[lang].slug, b: cand.slug });
      continue;
    }
    members[lang] = cand;
  }
  return { members, conflicts };
}

/**
 * Todos los clusters de un listado completo de posts, resuelto en memoria.
 * Mismo criterio que clusterFrom — este módulo sigue siendo el único que decide
 * quién es traducción de quién — pero sin una consulta por nota, para poder
 * barrer el sitio entero de una.
 */
function clustersFrom(posts) {
  const pub = posts.filter(p => !p.status || p.status === 'published');
  const bySlug = new Map();
  const byBase = new Map();
  for (const p of pub) {
    bySlug.set(p.slug, p);
    for (const k of new Set([p.slug, p.slug.replace(/-\d+$/, '')])) {
      if (!byBase.has(k)) byBase.set(k, []);
      byBase.get(k).push(p);
    }
  }
  const out = [];
  for (const es of pub) {
    if (postLang(es) !== 'es') continue;
    const cands = (byBase.get(es.slug) || []).filter(p => p.id !== es.id);
    const enSlug = metaValue(es.codeinjection_head, 'english-version');
    const en = enSlug ? bySlug.get(enSlug) : null;
    if (en && !cands.some(p => p.id === en.id)) cands.push(en);
    out.push(clusterFrom(es, cands));
  }
  return out;
}

/** Los <link> del set completo, self incluido. Orden estable: LANGS. */
function linksFor(members) {
  return LANGS
    .filter(l => members[l])
    .map(l => `<link rel="alternate" hreflang="${l}" href="${SITE}/${l}/${members[l].slug}/" />`);
}

const RX_HREFLANG = /[ \t]*<link[^>]*rel="alternate"[^>]*hreflang="[a-z-]+"[^>]*>[ \t]*\r?\n?/gi;

/** Reemplaza el bloque hreflang preservando todo lo demás del head (metas, scripts). */
function applyToHead(head, links) {
  const resto = (head || '').replace(RX_HREFLANG, '').trim();
  return [resto, links.join('\n')].filter(Boolean).join('\n');
}

/**
 * ¿Dos heads tienen el mismo hreflang y el mismo resto?
 * Compara el CONJUNTO de links, no el texto: reordenarlos no cambia nada para
 * Google y escribir por eso dispara PUTs (y webhooks) sin motivo.
 */
function mismoBloque(a, b) {
  const set = h => [...(h || '').matchAll(/hreflang="([a-z-]+)"\s+href="([^"]+)"/g)]
    .map(m => `${m[1]} ${m[2]}`).sort().join('|');
  const resto = h => (h || '').replace(RX_HREFLANG, '').trim();
  return set(a) === set(b) && resto(a) === resto(b);
}

module.exports = { LANGS, INTL, SITE, postLang, metaValue, esTraduccionDe, clusterFrom, clustersFrom, linksFor, applyToHead, mismoBloque };
