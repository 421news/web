'use strict';

// Search Console consolidado: 421.news + cuatroveintiuno.com, por mes.
//
// REGLA CENTRAL: esto es acumulativo y NUNCA borra un mes.
//
// Google retiene 16 meses. El dominio viejo (cuatroveintiuno.com, migrado en
// octubre de 2025) se va a ir borrando solo de la API, mes a mes. Si este
// módulo reconstruyera los meses desde cero, cada refresco iría comiéndose la
// historia por el otro lado. Por eso el merge es POR DOMINIO Y POR TIPO: sólo
// pisa lo que la API efectivamente devolvió, y lo que no vino queda como estaba.
//
// El archivo gsc-consolidado.json del repo es la semilla y el respaldo: si el
// store se pierde o se corrompe, la historia vuelve de ahí. Se regenera con
// seo/scripts/generar-gsc-consolidado.py.
//
// Credenciales: son las del MCP de GSC (scope webmasters), no las de GA4, que
// sólo tienen analytics.readonly.

const https = require('https');

const STORE_SLUG = 'gsc-data-store';
const SITIOS = { '421.news': 'sc-domain:421.news', 'cuatroveintiuno.com': 'sc-domain:cuatroveintiuno.com' };
const TIPOS = { web: 'WEB', discover: 'DISCOVER' };
const MESES_A_REFRESCAR = 3;   // el mes en curso y los dos previos: GSC corrige datos varios días
const TOP = 12;

const CLIENT_ID = (process.env.GSC_CLIENT_ID || '').trim();
const CLIENT_SECRET = (process.env.GSC_CLIENT_SECRET || '').trim();
const REFRESH_TOKEN = (process.env.GSC_REFRESH_TOKEN || '').trim();
const ENABLED = !!(CLIENT_ID && CLIENT_SECRET && REFRESH_TOKEN);

let deps = null;        // { ghostRequest }
let semilla = null;     // gsc-consolidado.json
let store = null;       // { generado, cobertura, meses: [...] }
let ultimo = null;      // resultado del último refresco

function init(d, seed) { deps = d; semilla = seed; }

// --- Store (página draft de Ghost, mismo patrón que revista-gate y promo) ---

async function loadStore(force) {
  if (store && !force) return store;
  try {
    const data = await deps.ghostRequest('GET', `/ghost/api/admin/pages/slug/${STORE_SLUG}/`);
    const page = data && data.pages && data.pages[0];
    if (page && page.codeinjection_foot) {
      const obj = JSON.parse(page.codeinjection_foot);
      if (obj && Array.isArray(obj.meses) && obj.meses.length) { store = obj; return store; }
    }
  } catch (e) { /* 404 = todavía no existe */ }
  // Primera vez (o store ilegible): se arranca del archivo histórico del repo.
  store = semilla ? JSON.parse(JSON.stringify(semilla)) : { generado: null, cobertura: {}, meses: [] };
  console.log(`[gsc] store sembrado desde el repo (${store.meses.length} meses)`);
  return store;
}

async function saveStore() {
  if (!store) return;
  const blob = JSON.stringify(store);
  let page = null;
  try {
    const data = await deps.ghostRequest('GET', `/ghost/api/admin/pages/slug/${STORE_SLUG}/`);
    page = data && data.pages && data.pages[0];
  } catch (e) {
    // Sólo un 404 significa "no existe". Tratar un timeout como 404 crea una
    // página nueva con slug -2 y deja el store real huérfano.
    if (!/Ghost API 404/.test(e.message)) {
      console.error(`[gsc] store ilegible (${e.message}) — no escribo para no duplicarlo`);
      return;
    }
  }
  if (page) {
    await deps.ghostRequest('PUT', `/ghost/api/admin/pages/${page.id}/`, {
      pages: [{ codeinjection_foot: blob, updated_at: page.updated_at }]
    });
  } else {
    await deps.ghostRequest('POST', '/ghost/api/admin/pages/', {
      pages: [{ title: 'GSC data store (interno — no publicar)', slug: STORE_SLUG, status: 'draft', codeinjection_foot: blob }]
    });
    console.log('[gsc] store creado');
  }
}

// --- API de Google ---

function pedir(opts, cuerpo) {
  return new Promise((res, rej) => {
    const req = https.request(opts, (r) => {
      let d = '';
      r.on('data', c => d += c);
      r.on('end', () => {
        if (r.statusCode < 200 || r.statusCode >= 300) return rej(new Error(`${r.statusCode} ${d.slice(0, 200)}`));
        try { res(JSON.parse(d)); } catch (e) { rej(e); }
      });
    });
    req.on('error', rej);
    if (cuerpo) req.write(cuerpo);
    req.end();
  });
}

async function token() {
  const body = new URLSearchParams({
    client_id: CLIENT_ID, client_secret: CLIENT_SECRET,
    refresh_token: REFRESH_TOKEN, grant_type: 'refresh_token'
  }).toString();
  const j = await pedir({
    hostname: 'oauth2.googleapis.com', path: '/token', method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Content-Length': Buffer.byteLength(body) }
  }, body);
  return j.access_token;
}

async function consultar(tk, prop, tipo, ini, fin, dims, limite) {
  const body = JSON.stringify({ startDate: ini, endDate: fin, dimensions: dims, type: tipo, rowLimit: limite || 100 });
  const j = await pedir({
    hostname: 'searchconsole.googleapis.com',
    path: `/webmasters/v3/sites/${encodeURIComponent(prop)}/searchAnalytics/query`,
    method: 'POST',
    headers: { Authorization: 'Bearer ' + tk, 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) }
  }, body);
  return j.rows || [];
}

// --- Refresco ---

function mesesRecientes(n) {
  const hoy = new Date();
  const out = [];
  for (let i = 0; i < n; i++) {
    const d = new Date(Date.UTC(hoy.getUTCFullYear(), hoy.getUTCMonth() - i, 1));
    out.push(d.toISOString().slice(0, 7));
  }
  return out.reverse();
}

function rango(mes) {
  const y = +mes.slice(0, 4), m = +mes.slice(5);
  const ini = `${mes}-01`;
  const finMes = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
  const ayer = new Date(Date.now() - 2 * 86400000).toISOString().slice(0, 10);
  return [ini, finMes > ayer ? ayer : finMes];
}

async function refrescar(motivo) {
  if (!ENABLED) return { ok: false, error: 'sin credenciales GSC' };
  await loadStore();
  const tk = await token();
  const tocados = [];

  for (const mes of mesesRecientes(MESES_A_REFRESCAR)) {
    const [ini, fin] = rango(mes);
    if (ini > fin) continue;

    let fila = store.meses.find(m => m.mes === mes);
    if (!fila) { fila = { mes }; store.meses.push(fila); }

    const topNuevo = {};
    let hubo = false;

    for (const [dom, prop] of Object.entries(SITIOS)) {
      for (const [tipo, st] of Object.entries(TIPOS)) {
        let filas;
        try { filas = await consultar(tk, prop, st, ini, fin, ['date'], 100); }
        catch (e) { console.error(`[gsc] ${dom}/${tipo}/${mes}: ${e.message}`); continue; }
        if (!filas.length) continue;   // sin datos: NO se toca lo que ya estaba

        hubo = true;
        const v = { clicks: 0, impresiones: 0 };
        for (const f of filas) { v.clicks += Math.round(f.clicks); v.impresiones += Math.round(f.impressions); }
        fila[dom] = fila[dom] || {};
        fila[dom][tipo] = v;

        // ranking de notas del mes, sólo para el dominio/tipo que sí respondió
        try {
          const pgs = await consultar(tk, prop, st, ini, fin, ['page'], TOP * 2);
          topNuevo[tipo] = topNuevo[tipo] || [];
          for (const f of pgs) {
            let u = f.keys[0].split('//')[1] || '';
            u = u.indexOf('/') > -1 ? u.slice(u.indexOf('/')) : '/';
            const it = { u, c: Math.round(f.clicks), i: Math.round(f.impressions) };
            if (dom !== '421.news') it.x = 1;
            topNuevo[tipo].push(it);
          }
        } catch (e) { /* el ranking es accesorio: si falla, quedan los totales */ }
      }
    }

    if (!hubo) continue;

    // El top se rearma con lo nuevo, pero conservando las entradas del dominio
    // que esta vez no respondió (típicamente el viejo, ya fuera de los 16 meses).
    const viejoTop = (fila.top || {});
    fila.top = {};
    for (const tipo of Object.keys(TIPOS)) {
      const nuevas = topNuevo[tipo] || [];
      const domsConDatos = new Set(nuevas.map(r => r.x ? 'viejo' : 'nuevo'));
      const conservadas = (viejoTop[tipo] || []).filter(r => !domsConDatos.has(r.x ? 'viejo' : 'nuevo'));
      const juntas = nuevas.concat(conservadas);
      if (juntas.length) fila.top[tipo] = juntas.sort((a, b) => b.c - a.c).slice(0, TOP);
    }
    if (!Object.keys(fila.top).length) delete fila.top;

    let c = 0, i = 0;
    for (const dom of Object.keys(SITIOS)) {
      for (const v of Object.values(fila[dom] || {})) { c += v.clicks; i += v.impresiones; }
    }
    fila.total = { clicks: c, impresiones: i };
    tocados.push(mes);
  }

  store.meses.sort((a, b) => a.mes < b.mes ? -1 : 1);
  store.generado = new Date().toISOString();
  await saveStore();
  ultimo = { cuando: store.generado, motivo, meses: tocados, total: store.meses.length };
  console.log(`[gsc] refrescado (${motivo}): ${tocados.join(', ') || 'nada'} · ${store.meses.length} meses en total`);
  return { ok: true, ...ultimo };
}

// --- HTTP ---

function cors(res) {
  res.set('Access-Control-Allow-Origin', 'https://www.421.news');
  res.set('Vary', 'Origin');
}

async function servir(req, res) {
  cors(res);
  try {
    await loadStore();
    // 5 minutos, no horas: este JSON cambia de FORMA, no sólo de números (se le
    // sumó el ranking de notas). Con una cache larga, un navegador que pidió el
    // esquema viejo se queda con él y ni un hard reload lo saca, porque el fetch
    // pasa al hacer click en la pestaña y no al cargar la página.
    res.set('Cache-Control', 'public, max-age=300');
    res.json(store);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}

function preflight(req, res) {
  cors(res);
  res.set('Access-Control-Allow-Methods', 'GET');
  res.status(204).end();
}

function estado() {
  if (!ENABLED) return 'sin credenciales';
  if (!store) return 'not loaded';
  return `${store.meses.length} meses` + (ultimo ? ` · último refresco ${ultimo.cuando.slice(0, 10)}` : '');
}

module.exports = { init, loadStore, refrescar, servir, preflight, estado, ENABLED };
