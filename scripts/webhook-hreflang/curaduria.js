'use strict';
/**
 * Curaduría (Canon + Rutas) propagada a las traducciones.
 *
 * La membresía del Canon y de las Rutas vive en tags internos de Ghost
 * (#canon, #ruta-{id}) y se cura UNA sola vez: en la nota en español. Este
 * módulo la copia al resto del cluster de traducciones, para que /en/routes/,
 * /en/canon/ y las 6 páginas intl muestren exactamente lo mismo que /es/rutas/
 * y /es/canon/ sin que nadie tenga que re-tagear ocho veces.
 *
 * Por qué existe: hasta el 2026-08-23 los tags se ponían a mano por post, así
 * que cada re-curaduría en español dejaba a las traducciones congeladas en la
 * selección vieja. Medido: 204 posts fuera de sincro, con /en/routes/ mostrando
 * 12 textos en una ruta donde /es/rutas/ mostraba 8 — la mitad de ellos sacados
 * de la ruta hacía meses.
 *
 * Reglas:
 *   - El ES manda, siempre. Se agregan los que faltan y se sacan los que sobran;
 *     una baja en español tiene que ser una baja en los 7 idiomas o el archivo
 *     vuelve a divergir.
 *   - Solo se tocan los tags curatoriales. El resto de los tags del post
 *     (temáticos, de formato, de idioma) se preservan tal cual.
 *   - El tag de idioma queda ÚLTIMO en el array. Si queda primero, Ghost saltea
 *     los tags temáticos al calcular primary_tag.
 *   - Quién es traducción de quién lo decide hreflang-cluster.js y nadie más.
 */

const C = require('./hreflang-cluster');

const RX_CURATORIAL = /^hash-(canon|ruta-[a-z0-9-]+)$/;
const RX_LANG = new RegExp(`^hash-(${C.LANGS.filter(l => l !== 'es').join('|')})$`);

const esCuratorial = t => RX_CURATORIAL.test(t.slug);
const esLang = t => RX_LANG.test(t.slug);

/**
 * Qué habría que escribirle a `member` para que su curaduría sea la del `esPost`.
 * Devuelve null si ya está sincronizado (o si no se puede decidir).
 */
function planFor(esPost, member) {
  // Sin tags cargados no se puede saber qué hay que preservar: abstenerse antes
  // que mandar un array de tags incompleto, que en Ghost es un borrado.
  if (!Array.isArray(esPost.tags) || !Array.isArray(member.tags)) return null;

  const objetivo = esPost.tags.filter(esCuratorial);
  const actuales = member.tags.filter(esCuratorial);
  const objSlugs = new Set(objetivo.map(t => t.slug));
  const actSlugs = new Set(actuales.map(t => t.slug));

  const add = objetivo.filter(t => !actSlugs.has(t.slug)).map(t => t.slug);
  const del = actuales.filter(t => !objSlugs.has(t.slug)).map(t => t.slug);
  if (!add.length && !del.length) return null;

  const resto = member.tags.filter(t => !esCuratorial(t) && !esLang(t));
  const lang = member.tags.filter(esLang);
  const tags = [...resto, ...objetivo, ...lang].map(t => ({ id: t.id, name: t.name, slug: t.slug }));

  return { tags, add, del };
}

/** Los posts publicados del sitio, con tags. Paginado. */
async function todosLosPosts(ghostRequest) {
  const out = [];
  let page = 1, pages = 1;
  do {
    const d = await ghostRequest('GET',
      `/ghost/api/admin/posts/?limit=100&page=${page}&include=tags` +
      `&fields=id,slug,title,status,published_at,updated_at,codeinjection_head`);
    out.push(...(d.posts || []));
    pages = d.meta.pagination.pages;
    page++;
  } while (page <= pages);

  // `fields` e `include` se pisan en algunas versiones de la API de Ghost y los
  // tags vuelven vacíos. Un sweep con tags vacíos borraría la curaduría entera,
  // así que se corta acá antes de escribir nada.
  if (out.length && !out.some(p => Array.isArray(p.tags) && p.tags.length)) {
    throw new Error('la API devolvió posts sin tags — no sincronizo');
  }
  return out;
}

/**
 * Barrido completo: sincroniza la curaduría de todos los clusters del sitio.
 * Es la red de seguridad del webhook, y también el backfill.
 */
async function sweep({ ghostRequest, dry = false, log = console.log } = {}) {
  const posts = await todosLosPosts(ghostRequest);
  const clusters = C.clustersFrom(posts);
  const cambios = [];
  let conflictos = 0;

  for (const { members, conflicts } of clusters) {
    // Misma abstención que el hreflang: si dos posts reclaman el mismo idioma
    // no sabemos a cuál escribirle.
    if (conflicts.length) { conflictos++; continue; }

    for (const lang of Object.keys(members)) {
      if (lang === 'es') continue;
      const plan = planFor(members.es, members[lang]);
      if (!plan) continue;
      cambios.push({ lang, slug: members[lang].slug, es: members.es.slug, add: plan.add, del: plan.del });
      if (dry) continue;
      await ghostRequest('PUT', `/ghost/api/admin/posts/${members[lang].id}/`, {
        posts: [{ tags: plan.tags, updated_at: members[lang].updated_at }]
      });
    }
  }

  log(`[curaduria] sweep${dry ? ' (dry)' : ''}: ${clusters.length} clusters, ` +
      `${cambios.length} posts ${dry ? 'a sincronizar' : 'sincronizados'}` +
      (conflictos ? `, ${conflictos} en conflicto (salteados)` : ''));
  return { clusters: clusters.length, conflictos, cambios };
}

module.exports = { planFor, sweep, todosLosPosts, esCuratorial, esLang };
