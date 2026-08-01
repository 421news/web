/**
 * Emails automatizados — drip de altas nuevas + campañas por segmento.
 *
 * Corre solo, en Render. Diseño y racional: contenido/automatizacion-emails.md
 * Textos: ./copys.js (fuente única)
 *
 * Robusto a reinicios: en vez de un timer semanal (que un restart borraría),
 * chequea cada hora si hoy es el día de envío. Como cada envío tiene un slug
 * determinístico por fecha, correr el chequeo 24 veces en el día manda una vez.
 *
 * Apagar: EMAILS_AUTO=off en el env de Render.
 */
const jwt = require('jsonwebtoken');
const { COPYS } = require('./copys');

const GHOST_URL = process.env.GHOST_URL || 'https://421bn.ghost.io';
const GHOST_ADMIN_KEY = process.env.GHOST_ADMIN_KEY;
const NEWSLETTER = 'marketing';

const DIA_ENVIO = 2;        // 0=domingo … 2=martes
const HORA_ENVIO_ART = 9;   // 09:00 hora de Buenos Aires
const MAX_DESTINATARIOS = 4000;
const REVISTA_PAGE_API = `${GHOST_URL}/ghost/api/content/pages/slug/revista-421/?key=420da6f85b5cc903b347de9e33`;

// ── Calendario: el Concilio es el ÚLTIMO DOMINGO de cada mes ────────────────
// Excepciones cuando una edición se corre: clave = mes al que PERTENECE.
const CONCILIO_EXCEPCIONES = {
  '2026-07': '2026-08-02'
};
const VENTANA_PRE_CONCILIO = [2, 7];
const VENTANA_POST_CONCILIO = [12, 18];

function ultimoDomingo(anio, mes) {
  const d = new Date(Date.UTC(anio, mes, 0));
  d.setUTCDate(d.getUTCDate() - d.getUTCDay());
  return d.toISOString().slice(0, 10);
}
function conciliosCerca(centro) {
  const out = [], base = new Date(centro);
  for (let i = -6; i <= 6; i++) {
    const d = new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth() + i, 1));
    const k = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
    out.push(CONCILIO_EXCEPCIONES[k] || ultimoDomingo(d.getUTCFullYear(), d.getUTCMonth() + 1));
  }
  return [...new Set(out)].sort();
}
const diasEntre = (a, b) => Math.round((new Date(b) - new Date(a)) / 86400000);

// ── Ghost ───────────────────────────────────────────────────────────────────
function ghostToken() {
  const [id, secret] = GHOST_ADMIN_KEY.split(':');
  return jwt.sign({}, Buffer.from(secret, 'hex'), { keyid: id, algorithm: 'HS256', expiresIn: '5m', audience: '/admin/' });
}
async function ghost(method, path, body) {
  const r = await fetch(`${GHOST_URL}/ghost/api/admin${path}`, {
    method,
    headers: { Authorization: `Ghost ${ghostToken()}`, 'Accept-Version': 'v5.0', 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined
  });
  const txt = await r.text();
  let j = null; try { j = JSON.parse(txt); } catch { /* noop */ }
  return { ok: r.ok, status: r.status, j, txt };
}
async function contar(filtro) {
  const r = await ghost('GET', `/members/?limit=1&filter=${encodeURIComponent(filtro)}`);
  if (!r.ok) throw new Error(`contar -> HTTP ${r.status}`);
  return r.j.meta.pagination.total;
}

// El alcance real de un envío es la INTERSECCIÓN del email_segment con quienes
// están suscriptos a esa newsletter. Contar solo el segmento miente: el filtro
// puede dar 221 y llegar a 168 porque 53 no están en la lista.
const _nlCache = {};
async function newsletterId(slug) {
  if (_nlCache[slug]) return _nlCache[slug];
  const r = await ghost('GET', `/newsletters/?limit=all`);
  if (!r.ok) return null;
  (r.j.newsletters || []).forEach(n => { _nlCache[n.slug] = n.id; });
  return _nlCache[slug] || null;
}

async function ultimaRevista() {
  try {
    const r = await fetch(REVISTA_PAGE_API);
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const page = (await r.json()).pages[0];
    const t = [...(page.html || '').matchAll(/<h[23][^>]*>(.*?)<\/h[23]>/gs)]
      .map(m => m[1].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim())
      .filter(x => /^#\s*\d+/.test(x));
    if (!t.length) return null;
    return { titulo: t.map(x => ({ x, n: +x.match(/^#\s*(\d+)/)[1] })).sort((a, b) => b.n - a.n)[0].x };
  } catch (e) {
    console.error(`[emails] revista: ${e.message}`);
    return null;
  }
}

// ── Campañas ────────────────────────────────────────────────────────────────

/**
 * Ghost NO soporta `subscribed` dentro de un email_segment, y falla de la peor
 * manera posible: lo acepta al programar y explota recién al enviar, con un
 * ER_BAD_FIELD_ERROR que nadie ve. El post queda clavado en `scheduled` con la
 * hora ya pasada y el mail no sale (nos pasó el 2026-08-01 con los dos del
 * Concilio: se programaron el 31 y no salieron a las 09:00).
 *
 * Es redundante, además: Ghost solo entrega a los suscriptos a esa newsletter,
 * y el alcance ya se calcula intersecando con `newsletters.id`.
 */
function limpiarSegmento(filtro) {
  const limpio = String(filtro || '')
    .replace(/\+?subscribed:(true|false)/g, '')
    .replace(/^\+/, '')
    .replace(/\+{2,}/g, '+');
  return limpio || 'all';
}

const FREE = 'status:free';
const semanasAtras = (hoy, n) => new Date(new Date(hoy) - n * 7 * 86400000).toISOString().slice(0, 10);

const CAMPANAS = [
  { id: 'bienvenida-1', tipo: 'drip', ventana: [1, 2] },
  { id: 'bienvenida-2', tipo: 'drip', ventana: [2, 3] },
  { id: 'bienvenida-3', tipo: 'drip', ventana: [4, 5] },
  { id: 'bienvenida-4', tipo: 'drip', ventana: [6, 7] },
  { id: 'concilio', tipo: 'pre-concilio', filtro: h => `${FREE}+email_open_rate:>10+created_at:<'${semanasAtras(h, 8)}'` },

  // Recordatorio a los que YA pagan. Mismo timing que el del núcleo, pero otro
  // segmento, otra newsletter y sin venta: solo dónde está el link.
  { id: 'concilio-suscriptores', tipo: 'pre-concilio',
    newsletter: 'default-newsletter-2',
    filtro: () => 'status:-free' },

  { id: 'revista', tipo: 'post-concilio', filtro: h => `${FREE}+email_open_rate:>10+created_at:<'${semanasAtras(h, 8)}'` },
  { id: 'cold', tipo: 'segmento', cada: 12, offset: 4, filtro: h => `${FREE}+email_open_rate:<=10+last_seen_at:<'${semanasAtras(h, 13)}'+created_at:<'${semanasAtras(h, 8)}'` }
];

function semanaDelAnio(d) {
  const dd = new Date(d);
  return Math.floor((dd - new Date(Date.UTC(dd.getUTCFullYear(), 0, 1))) / (7 * 86400000));
}

function toca(c, hoy) {
  if (c.tipo === 'drip') return true;
  const cal = conciliosCerca(hoy);
  const prox = cal.map(x => diasEntre(hoy, x)).filter(d => d >= 0).sort((a, b) => a - b)[0];
  if (c.tipo === 'pre-concilio') {
    if (prox === undefined) return { no: 'sin Concilios futuros' };
    return (prox >= VENTANA_PRE_CONCILIO[0] && prox <= VENTANA_PRE_CONCILIO[1]) || { no: `faltan ${prox}d` };
  }
  if (c.tipo === 'post-concilio') {
    if (prox !== undefined && prox <= VENTANA_PRE_CONCILIO[1]) return { no: `el Concilio es en ${prox}d, tiene prioridad` };
    const desde = cal.map(x => diasEntre(x, hoy)).filter(d => d > 0).sort((a, b) => a - b)[0];
    if (desde === undefined) return { no: 'no pasó ningún Concilio' };
    return (desde >= VENTANA_POST_CONCILIO[0] && desde <= VENTANA_POST_CONCILIO[1]) || { no: `pasaron ${desde}d` };
  }
  return semanaDelAnio(hoy) % c.cada === c.offset % c.cada || { no: `cada ${c.cada} sem` };
}

function filtroDe(c, hoy) {
  if (c.tipo === 'drip') {
    const [d, h] = c.ventana;
    return `${FREE}+created_at:>'${semanasAtras(hoy, h)}'+created_at:<'${semanasAtras(hoy, d)}'`;
  }
  return c.filtro(hoy);
}

function renderHtml(id, revista) {
  const c = COPYS[id];
  let html = c.html;
  if (html.includes('{{REVISTA}}')) {
    const linea = revista && c.revistaLinea ? c.revistaLinea.replace('{{TITULO}}', revista.titulo) : null;
    html = linea ? html.replace('{{REVISTA}}', linea) : html.replace(/\n?<p>\{\{REVISTA\}\}<\/p>/, '');
  }
  return html;
}

/**
 * @param {object} opts
 * @param {boolean} opts.dry  no crea nada, solo informa
 * @param {string}  opts.hoy  YYYY-MM-DD (default: hoy)
 * @param {string}  opts.solo id de una sola campaña
 * @param {string}  opts.filtroOverride  NQL que reemplaza al del segmento (envíos puntuales)
 * @param {string}  opts.cuando  ISO datetime: en vez de enviar ya, lo deja
 *                               programado en Ghost para esa fecha/hora.
 * @param {number}  opts.max     sube el tope de destinatarios para un envío
 *                               puntual a toda la base. El default protege
 *                               contra un NQL mal escrito; esto lo levanta a
 *                               conciencia, no por accidente.
 */
async function correr(opts = {}) {
  const hoy = opts.hoy || new Date().toISOString().slice(0, 10);
  const dry = opts.dry !== false;
  const log = [];
  const push = m => { log.push(m); console.log(`[emails] ${m}`); };

  push(`corrida ${hoy} · modo=${dry ? 'dry' : 'ENVIAR'}${opts.solo ? ` · solo=${opts.solo}` : ''}`);
  const revista = await ultimaRevista();

  for (const c of CAMPANAS) {
    if (opts.solo && c.id !== opts.solo) continue;
    const t = toca(c, hoy);
    if (t !== true && !opts.solo) { push(`— ${c.id}: no toca (${t.no})`); continue; }

    const filtroPedido = opts.filtroOverride && opts.solo === c.id ? opts.filtroOverride : filtroDe(c, hoy);
    // Un --filtro a mano con `subscribed:true` programa un mail que después no sale
    const filtro = limpiarSegmento(filtroPedido);
    if (filtro !== filtroPedido) push(`  ${c.id}: segmento saneado → "${filtro}" (Ghost no acepta subscribed en email_segment)`);
    const nlSlug = c.newsletter || NEWSLETTER;
    let n, nSegmento;
    try {
      const nlId = await newsletterId(nlSlug);
      nSegmento = await contar(filtro);
      n = nlId ? await contar(`${filtro}+newsletters.id:${nlId}`) : nSegmento;
      if (nlId && n !== nSegmento) {
        push(`  ${c.id}: el segmento da ${nSegmento} pero ${nSegmento - n} no están en "${nlSlug}" → llegan ${n}`);
      }
    } catch (e) { push(`✗ ${c.id}: ${e.message}`); continue; }
    if (!n) { push(`— ${c.id}: 0 destinatarios`); continue; }
    const tope = opts.max || MAX_DESTINATARIOS;
    if (n > tope) { push(`✗ ${c.id}: ABORTADO, ${n} > ${tope}. Si es a propósito, pasar opts.max.`); continue; }

    const slug = `auto-${c.id}-${hoy}`;
    const ya = await ghost('GET', `/posts/?limit=1&filter=${encodeURIComponent(`slug:${slug}`)}`);
    if (ya.ok && ya.j.posts && ya.j.posts.length) { push(`— ${c.id}: ya existe (${slug})`); continue; }

    if (dry) { push(`▸ ${c.id}: ${opts.cuando ? 'programaría' : 'mandaría'} a ${n} vía ${c.newsletter || NEWSLETTER} (${filtro})`); continue; }

    const qs = new URLSearchParams({ source: 'html', newsletter: c.newsletter || NEWSLETTER, email_segment: filtro });
    const base = { title: COPYS[c.id].asunto, slug, html: renderHtml(c.id, revista), email_only: true };

    let r;
    if (opts.cuando) {
      // Ghost rechaza crear un email ya programado de una ("Scheduling an email
      // requires a newsletter reference"): la newsletter recien se asocia al
      // actualizar. Va en dos pasos, draft -> scheduled.
      const d = await ghost('POST', `/posts/?${qs}`, { posts: [{ ...base, status: 'draft' }] });
      if (!d.ok) { push(`✗ ${c.id}: draft HTTP ${d.status} ${d.txt.slice(0, 150)}`); continue; }
      const p = d.j.posts[0];
      r = await ghost('PUT', `/posts/${p.id}/?${qs}`, {
        posts: [{ updated_at: p.updated_at, status: 'scheduled', published_at: new Date(opts.cuando).toISOString() }]
      });
      if (!r.ok) {
        await ghost('DELETE', `/posts/${p.id}/`); // no dejar el draft colgado
        push(`✗ ${c.id}: schedule HTTP ${r.status} ${r.txt.slice(0, 150)}`);
        continue;
      }
      // Verificar que el segmento haya quedado aplicado antes de dar por bueno.
      const seg = r.j.posts[0].email_segment;
      if (seg !== filtro) {
        push(`⚠️ ${c.id}: el segmento quedo como "${seg}" y esperaba "${filtro}" — REVISAR ANTES DE QUE SALGA`);
      }
    } else {
      r = await ghost('POST', `/posts/?${qs}`, { posts: [{ ...base, status: 'published' }] });
    }
    push(r.ok
      ? `✔ ${c.id}: ${opts.cuando ? `PROGRAMADO para ${new Date(opts.cuando).toISOString()} →` : 'enviado a'} ${n} destinatarios`
      : `✗ ${c.id}: HTTP ${r.status} ${r.txt.slice(0, 150)}`);
  }
  return log;
}

// ── Scheduler: chequeo horario, robusto a reinicios ─────────────────────────
function horaART() {
  const s = new Date().toLocaleString('en-US', { timeZone: 'America/Argentina/Buenos_Aires' });
  const d = new Date(s);
  return { dia: d.getDay(), hora: d.getHours(), fecha: d.toISOString().slice(0, 10) };
}

/**
 * Detecta envíos clavados: posts `scheduled` cuya hora ya pasó.
 * Ghost no avisa cuando el envío falla al dispararse (un email_segment que la
 * query no soporta deja el post en scheduled para siempre, en silencio).
 * El 2026-08-01 los dos mails del Concilio estuvieron 3h así sin que nadie lo viera.
 */
async function revisarColgados(margenMin = 15) {
  const r = await ghost('GET', `/posts/?filter=${encodeURIComponent('status:scheduled')}&limit=all&fields=id,title,slug,published_at,email_segment`);
  if (!r.ok) return [];
  const limite = Date.now() - margenMin * 60000;
  const colgados = (r.j.posts || []).filter(p => p.published_at && new Date(p.published_at).getTime() < limite);
  for (const p of colgados) {
    const sospecha = /subscribed:/.test(p.email_segment || '') ? ' — el segmento tiene `subscribed`, que Ghost no soporta al enviar' : '';
    console.error(`[emails] ⚠️ COLGADO: "${p.title}" debía salir ${p.published_at} y sigue scheduled${sospecha}`);
  }
  return colgados;
}

function iniciar() {
  if (process.env.EMAILS_AUTO === 'off') {
    console.log('[emails] EMAILS_AUTO=off — automatización desactivada');
    return;
  }
  if (!GHOST_ADMIN_KEY) {
    console.error('[emails] falta GHOST_ADMIN_KEY — automatización NO iniciada');
    return;
  }
  const tick = async () => {
    // Corre todos los días, no solo el de envío: un mail puede quedar colgado
    // cualquier día (los programados a mano, sin ir más lejos).
    try { await revisarColgados(); }
    catch (e) { console.error(`[emails] revisión de colgados falló: ${e.message}`); }

    const { dia, hora } = horaART();
    if (dia !== DIA_ENVIO || hora < HORA_ENVIO_ART) return;
    try { await correr({ dry: false }); }
    catch (e) { console.error(`[emails] tick falló: ${e.message}`); }
  };
  setInterval(tick, 60 * 60 * 1000);
  setTimeout(tick, 2 * 60 * 1000); // primer chequeo 2 min después de arrancar
  console.log(`[emails] automatización activa — chequeo horario, envía los ${['dom','lun','mar','mié','jue','vie','sáb'][DIA_ENVIO]} desde las ${HORA_ENVIO_ART}:00 ART`);
}

module.exports = { correr, iniciar, CAMPANAS, conciliosCerca, revisarColgados, limpiarSegmento };
