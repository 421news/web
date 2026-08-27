'use strict';
/**
 * autores.js — ranking de autores para la pestaña "Autores" de /es/analytics/.
 *
 * Cruza las filas crudas de pagePath de GA4 (las MISMAS que ya pide
 * refreshGA4Data, no agrega ni una query) contra los posts de Ghost, y arma dos
 * rankings: por tráfico acumulado y por el pico de la mejor nota de cada autor.
 *
 * EL RECORTE, que es lo que hace comparables los números:
 *   - Solo idioma nativo. Las 995 traducciones quedan afuera: contarlas
 *     multiplicaría por 8 a quien tiene traducciones y por 1 al resto.
 *   - Solo 2024 en adelante. Hay ~50 notas anteriores (archivo importado de
 *     antes de que existiera 421), 49 de ellas de una sola persona.
 *   - Sin wikis. Son fichas cortas: rinden ~900 vistas contra ~2.500 de una
 *     nota, y solo las escriben tres autores, así que inflan su conteo.
 *
 * ⚠️ Un post EN se considera traducción si tiene el meta `spanish-version` O si
 * su slug se parece al de un post ES. Lo segundo hace falta porque hay
 * traducciones a las que nunca se les escribió el meta: sin ese chequeo, 5
 * traducciones se cuelan como si fueran originales en inglés.
 */

const LANGS = ['en', 'pt', 'fr', 'zh', 'ja', 'ko', 'tr'];
const PREFIJOS = new Set(['es', ...LANGS]);
const DESDE = '2024';

/** El slug de una URL de GA4, con el prefijo de idioma si lo trae. */
function parsePath(p) {
  const limpio = String(p).split('?')[0].split('#')[0].trim();
  let segs = limpio.split('/').filter(Boolean);
  if (!segs.length) return null;
  let lang = null;
  if (PREFIJOS.has(segs[0])) { lang = segs[0]; segs = segs.slice(1); }
  if (segs[0] === 'posts') segs = segs.slice(1);           // URLs viejas /posts/{slug}/
  if (!segs.length) return null;
  if (['tag', 'author', 'page', 'p'].includes(segs[0])) return null;
  let slug = segs[segs.length - 1];
  if ((slug === 'amp' || slug === 'null') && segs.length > 1) slug = segs[segs.length - 2];
  return { lang, slug };
}

function idiomaDe(tags) {
  const s = tags.map(t => t.slug);
  return LANGS.find(l => s.includes(`hash-${l}`)) || 'es';
}

/** Todos los posts publicados, con tags y autores. Paginado. */
async function traerPosts(ghostRequest) {
  const out = [];
  let page = 1, pages = 1;
  do {
    const d = await ghostRequest('GET',
      `/ghost/api/admin/posts/?limit=100&page=${page}&include=tags,authors` +
      `&fields=id,slug,title,url,status,published_at,codeinjection_head`);
    out.push(...(d.posts || []));
    pages = (d.meta && d.meta.pagination && d.meta.pagination.pages) || 1;
    page++;
  } while (page <= pages);

  // `fields` e `include` se pisan en algunas versiones de la API: sin tags no se
  // puede saber el idioma de nada y el ranking saldría vacío en silencio.
  if (out.length && !out.some(p => Array.isArray(p.tags) && p.tags.length)) {
    throw new Error('la API devolvió posts sin tags');
  }
  return out.filter(p => (p.status || 'published') === 'published');
}

function calcular(pageRows, posts) {
  // 1. Vistas por (idioma, slug), sumando todos los meses.
  const vistas = new Map();
  for (const row of pageRows || []) {
    const parsed = parsePath(row.dimensionValues[0].value);
    if (!parsed) continue;
    const pv = parseInt(row.metricValues[0].value, 10) || 0;
    const k = `${parsed.lang || ''}|${parsed.slug}`;
    vistas.set(k, (vistas.get(k) || 0) + pv);
  }
  const pvDe = (lang, slug) =>
    (vistas.get(`${lang}|${slug}`) || 0) +
    (lang === 'es' ? (vistas.get(`|${slug}`) || 0) : 0);   // URLs viejas sin prefijo

  // 2. Clasificar cada post.
  const slugsES = new Set();
  const meta = posts.map(p => {
    const tags = p.tags || [];
    const lang = idiomaDe(tags);
    if (lang === 'es') slugsES.add(p.slug);
    return {
      slug: p.slug, title: p.title, lang,
      wiki: tags.some(t => t.slug === 'wiki'),
      head: p.codeinjection_head || '',
      autores: (p.authors || []).map(a => a.name),
      fecha: (p.published_at || '').slice(0, 10),
    };
  });

  const esTraduccion = (m) => {
    if (m.lang === 'es') return false;
    if (m.lang !== 'en') return true;
    if (/name="spanish-version"/.test(m.head)) return true;
    // Traducción sin meta: se detecta por parecido de slug con un post ES.
    const pal = m.slug.split('-').filter(w => w.length > 4).slice(0, 4);
    for (const es of slugsES) {
      if (pal.filter(w => es.includes(w)).length >= 2) return true;
    }
    return false;
  };

  const sel = meta.filter(m =>
    !esTraduccion(m) && !m.wiki && m.fecha >= DESDE && m.autores.length);

  // 3. Agregar por autor.
  const porAutor = new Map();
  let pvTotal = 0;
  for (const m of sel) {
    const pv = pvDe(m.lang, m.slug);
    pvTotal += pv;
    for (const nombre of m.autores) {
      const limpio = nombre.replace(/[\u{1F300}-\u{1FAFF}‍♀-♂️]/gu, '').trim();
      if (!porAutor.has(limpio)) porAutor.set(limpio, { nombre: limpio, notas: 0, pv: 0, top: null });
      const a = porAutor.get(limpio);
      a.notas++; a.pv += pv;
      if (!a.top || pv > a.top.pv) {
        a.top = { pv, titulo: m.title, url: `https://www.421.news/${m.lang}/${m.slug}/`, fecha: m.fecha };
      }
    }
  }

  const lista = [...porAutor.values()].map(a => ({
    nombre: a.nombre, notas: a.notas, pv: a.pv,
    prom: Math.round(a.pv / a.notas),
    topT: a.top.titulo, topV: a.top.pv, topU: a.top.url, topF: a.top.fecha,
  }));

  // 4. Las dos posiciones, para poder comparar los rankings entre sí.
  [...lista].sort((x, y) => y.pv - x.pv).forEach((a, i) => { a.rT = i + 1; });
  [...lista].sort((x, y) => y.topV - x.topV).forEach((a, i) => { a.rP = i + 1; });
  lista.sort((x, y) => x.rT - y.rT);

  return {
    corte: 'nativas · 2024+ · sin traducciones · sin wikis',
    notas: sel.length,
    pv: pvTotal,
    autores: lista.length,
    prom: sel.length ? Math.round(pvTotal / sel.length) : 0,
    lista,
  };
}

module.exports = { calcular, traerPosts, parsePath };
