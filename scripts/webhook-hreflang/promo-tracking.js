'use strict';

// Medición de las piezas publicitarias del sitio (impresiones y clicks).
//
// POR QUÉ NO ALCANZA GA4
// Este número es el que se le muestra al anunciante para vender la próxima
// pauta, así que tiene que ser defendible. GA4 mide de menos por dos motivos
// que se suman: los bloqueadores cortan el propio gtag (el request va a
// google-analytics.com/g/collect, que está en todas las listas), y encima las
// listas de bloqueo filtran por patrones de texto en clases, ids y URLs — un
// evento llamado `ad_impression` o una imagen `banner-728x90.jpg` no llegan.
// La pérdida típica está entre el 20% y el 40% según el público; el de 421 es
// más técnico que el promedio, así que del lado alto.
//
// Contando acá pasa lo mismo que con las descargas de la revista: el server ve
// el evento, no lo come ningún bloqueador y podemos deduplicar por visitante.
// GA4 se sigue mandando en paralelo, porque sirve para cruzar con página y
// dispositivo. Si los dos números difieren mucho, la diferencia ES el dato:
// es la tasa de bloqueo de la audiencia.
//
// QUÉ SE GUARDA
// Ni el email, ni la IP, ni el user-agent. Sólo un hash corto e irreversible de
// (IP + UA + día + sal), que sirve para contar personas distintas dentro de un
// día y deja de servir al día siguiente. Los hashes se descartan a los 2 días;
// los conteos quedan.

const crypto = require('crypto');

const STORE_SLUG = 'promo-tracking-store';
const ORIGEN_OK = 'https://www.421.news';
const MAX_CAMPANAS = 50;          // techo del store: nadie infla el JSON con ids basura
const MAX_EVENTOS_MIN = 60;       // por visitante y por minuto
const DIAS_UIDS = 2;              // días de hashes que se conservan

let deps = null;                  // { ghostRequest }
let store = null;
let sal = crypto.randomBytes(16).toString('hex');   // rota en cada arranque, a propósito
let cargando = null;

function init(d) { deps = d; }

// --- Store privado (página draft de Ghost, mismo patrón que revista-gate) ---

async function loadStore(force) {
  if (store && !force) return store;
  if (cargando) return cargando;
  cargando = (async () => {
    try {
      const data = await deps.ghostRequest('GET', `/ghost/api/admin/pages/slug/${STORE_SLUG}/`);
      const page = data && data.pages && data.pages[0];
      if (page && page.codeinjection_foot) {
        const obj = JSON.parse(page.codeinjection_foot);
        if (obj && obj.campanas && typeof obj.campanas === 'object') {
          store = { v: 1, campanas: obj.campanas };
          return store;
        }
      }
    } catch (e) { /* 404 = todavía no existe */ }
    store = { v: 1, campanas: {} };
    return store;
  })().finally(() => { cargando = null; });
  return cargando;
}

async function saveStore() {
  if (!store) return;
  const blob = JSON.stringify(store);
  let page = null;
  try {
    const data = await deps.ghostRequest('GET', `/ghost/api/admin/pages/slug/${STORE_SLUG}/`);
    page = data && data.pages && data.pages[0];
  } catch (e) {
    // Igual que en revista-gate: sólo un 404 significa "no existe". Tratar un
    // timeout como 404 nos hace crear una página nueva, Ghost le pone slug -2 y
    // el store real queda huérfano (así se fabricaron 5 revenue-data-store-N).
    if (!/Ghost API 404/.test(e.message)) {
      console.error(`[promo] store ilegible (${e.message}) — no escribo para no duplicarlo`);
      return;
    }
    page = null;
  }
  if (page) {
    await deps.ghostRequest('PUT', `/ghost/api/admin/pages/${page.id}/`, {
      pages: [{ codeinjection_foot: blob, updated_at: page.updated_at }]
    });
  } else {
    await deps.ghostRequest('POST', '/ghost/api/admin/pages/', {
      pages: [{ title: 'Promo tracking store (interno — no publicar)', slug: STORE_SLUG, status: 'draft', codeinjection_foot: blob }]
    });
    console.log('[promo] store creado');
  }
}

let saveTimer = null;
function persistirPronto() {
  if (saveTimer) return;
  // Debounce de 60s: en la home las impresiones llegan de a muchas y no queremos
  // un PUT a Ghost por cada visita.
  saveTimer = setTimeout(() => {
    saveTimer = null;
    saveStore().catch(e => console.error(`[promo] no pude guardar: ${e.message}`));
  }, 60 * 1000);
}

// --- Identidad efímera del visitante ---

function hoyART() {
  // Todo el reporte va en hora argentina: es la zona en la que se lee y en la
  // que se factura la pauta.
  return new Date(Date.now() - 3 * 3600 * 1000).toISOString().slice(0, 10);
}

function uidDe(req, dia) {
  const ip = (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.ip || '';
  const ua = req.headers['user-agent'] || '';
  return crypto.createHash('sha256').update(ip + '|' + ua + '|' + dia + '|' + sal).digest('hex').slice(0, 10);
}

// Rate limit en memoria: { uid: [minuto, cuenta] }
const golpes = new Map();
function demasiado(uid) {
  const min = Math.floor(Date.now() / 60000);
  const v = golpes.get(uid);
  if (!v || v[0] !== min) { golpes.set(uid, [min, 1]); if (golpes.size > 20000) golpes.clear(); return false; }
  v[1]++;
  return v[1] > MAX_EVENTOS_MIN;
}

// --- Registro ---

function campana(id) {
  if (!store.campanas[id]) {
    if (Object.keys(store.campanas).length >= MAX_CAMPANAS) return null;
    store.campanas[id] = { inicio: hoyART(), total: { i: 0, c: 0 }, disp: {}, ubic: {}, dias: {}, _uids: {} };
  }
  return store.campanas[id];
}

function podar(c) {
  const dias = Object.keys(c._uids).sort();
  while (dias.length > DIAS_UIDS) delete c._uids[dias.shift()];
}

function cors(res) {
  res.set('Access-Control-Allow-Origin', ORIGEN_OK);
  res.set('Vary', 'Origin');
}

// POST /api/pza/e  — body text/plain con {c,t,p,d}
// Devuelve 204 siempre y sin cuerpo: es un beacon, al cliente no le importa la
// respuesta y no queremos que un error de medición se note en la página.
async function registrar(req, res) {
  cors(res);
  res.status(204).end();
  try {
    // El Origin lo pone el navegador y no se puede falsear desde otra página.
    // No frena a alguien con curl (para eso está el rate limit + los únicos),
    // pero sí frena que la medición se ensucie desde cualquier otro sitio.
    if (req.headers.origin && req.headers.origin !== ORIGEN_OK) return;

    let b = req.body;
    if (typeof b === 'string') { try { b = JSON.parse(b); } catch (e) { return; } }
    if (!b || typeof b !== 'object') return;

    const id = String(b.c || '');
    if (!/^[a-z0-9][a-z0-9-]{2,39}$/.test(id)) return;
    const tipo = b.t === 'c' ? 'c' : (b.t === 'i' ? 'i' : null);
    if (!tipo) return;
    const disp = b.d === 'm' ? 'm' : 'd';
    const ubic = /^[a-z0-9-]{1,24}$/.test(String(b.p || '')) ? String(b.p) : 'na';

    await loadStore();
    const dia = hoyART();
    const uid = uidDe(req, dia);
    if (demasiado(uid)) return;

    const c = campana(id);
    if (!c) return;

    c.total[tipo]++;
    if (!c.disp[disp]) c.disp[disp] = { i: 0, c: 0 };
    c.disp[disp][tipo]++;
    if (!c.ubic[ubic]) c.ubic[ubic] = { i: 0, c: 0 };
    c.ubic[ubic][tipo]++;
    if (!c.dias[dia]) c.dias[dia] = { i: 0, c: 0, u: 0 };
    c.dias[dia][tipo]++;

    // Personas distintas del día. Es el número honesto: una misma persona que
    // entra ocho veces son ocho impresiones y un solo alcance.
    if (!c._uids[dia]) c._uids[dia] = [];
    if (c._uids[dia].indexOf(uid) === -1) {
      c._uids[dia].push(uid);
      c.dias[dia].u++;
      podar(c);
    }

    persistirPronto();
  } catch (e) {
    console.error(`[promo] registrar: ${e.message}`);
  }
}

// GET /api/pza/reporte[?c=id][&dias=N] — los números para el anunciante
async function reporte(req, res) {
  cors(res);
  try {
    await loadStore();
    const nDias = Math.min(180, Math.max(1, parseInt(req.query.dias, 10) || 60));
    const desde = new Date(Date.now() - 3 * 3600 * 1000 - nDias * 86400000).toISOString().slice(0, 10);
    // Las campañas `test-*` no salen en el reporte: este JSON es el que termina
    // en el dashboard del equipo y, eventualmente, en un media kit. Una prueba de
    // humo con CTR del 33% ahí adentro es peor que no tener el dato.
    const ids = req.query.c ? [String(req.query.c)]
      : Object.keys(store.campanas).filter(id => req.query.test === '1' || !/^test-/.test(id));

    const out = {};
    for (const id of ids) {
      const c = store.campanas[id];
      if (!c) continue;
      const dias = {};
      let i = 0, cl = 0, u = 0;
      for (const d of Object.keys(c.dias).sort()) {
        if (d < desde) continue;
        dias[d] = c.dias[d];
        i += c.dias[d].i; cl += c.dias[d].c; u += c.dias[d].u || 0;
      }
      out[id] = {
        inicio: c.inicio,
        historico: { impresiones: c.total.i, clicks: c.total.c, ctr: pct(c.total.c, c.total.i) },
        periodo: { dias: nDias, impresiones: i, clicks: cl, alcance: u, ctr: pct(cl, i) },
        dispositivo: {
          mobile: conCtr(c.disp.m), desktop: conCtr(c.disp.d)
        },
        ubicacion: Object.fromEntries(Object.entries(c.ubic).map(([k, v]) => [k, conCtr(v)])),
        porDia: dias
      };
    }
    res.set('Cache-Control', 'public, max-age=300');
    res.json({ generado: new Date().toISOString(), campanas: out });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}

function pct(a, b) { return b ? Math.round((a / b) * 10000) / 100 : 0; }
function conCtr(v) {
  if (!v) return { impresiones: 0, clicks: 0, ctr: 0 };
  return { impresiones: v.i, clicks: v.c, ctr: pct(v.c, v.i) };
}

function preflight(req, res) {
  cors(res);
  res.set('Access-Control-Allow-Methods', 'POST, GET');
  res.set('Access-Control-Allow-Headers', 'Content-Type');
  res.set('Access-Control-Max-Age', '86400');
  res.status(204).end();
}

function status() {
  if (!store) return 'not loaded';
  const ids = Object.keys(store.campanas);
  if (!ids.length) return 'sin campañas';
  return ids.map(id => `${id}: ${store.campanas[id].total.i}i/${store.campanas[id].total.c}c`).join(', ');
}

// Al apagarse Render manda SIGTERM: sin esto se pierde hasta un minuto de
// eventos por el debounce.
function flush() {
  if (saveTimer) { clearTimeout(saveTimer); saveTimer = null; }
  return saveStore().catch(e => console.error(`[promo] flush: ${e.message}`));
}

module.exports = { init, registrar, reporte, preflight, status, flush, loadStore };
