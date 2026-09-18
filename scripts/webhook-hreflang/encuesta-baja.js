'use strict';

// Encuesta a ex suscriptores (2026-09): por qué se dieron de baja.
//
// Vive en una página de Ghost (/es/por-que-te-fuiste/) en vez de en el theme
// para no depender de routes.yaml, que Ghost no deja subir por API (403).
//
// El link de cada persona trae su mail y un token HMAC del mismo secreto que
// usa la oferta de regreso en mercadopago-ghost: así el formulario sabe quién
// contesta sin pedirle el mail, y nadie puede responder por otro.
//
// Se guarda: mail, cohorte de la oferta y respuestas. Nada de IP ni user-agent.
// El store es una página draft de Ghost, mismo patrón que revista-gate.

const crypto = require('crypto');

const STORE_SLUG = 'encuesta-baja-store';
const SECRET = process.env.PROMO_SECRET || '';
const REPORTE_KEY = process.env.ENCUESTA_KEY || process.env.EMAILS_RUN_KEY || '';
const ORIGENES_OK = ['https://www.421.news', 'https://421.news'];
const MAX_RESPUESTAS = 500;
const MAX_TEXTO = 2000;

let deps = null;
let store = null;
let cargando = null;

function init(d) { deps = d; }

function token(email, tipo) {
  return crypto.createHmac('sha256', SECRET).update(String(email).toLowerCase().trim() + '|' + tipo).digest('hex').slice(0, 24);
}
// Vale el token de cualquiera de las dos ofertas: es el mismo mail.
function tokenValido(email, t) {
  if (!SECRET || !t) return false;
  return ['promo5-monthly', 'promo25-monthly'].some(tipo => token(email, tipo) === t);
}

async function loadStore(force) {
  if (store && !force) return store;
  if (cargando) return cargando;
  cargando = (async () => {
    try {
      const data = await deps.ghostRequest('GET', `/ghost/api/admin/pages/slug/${STORE_SLUG}/`);
      const page = data && data.pages && data.pages[0];
      if (page && page.codeinjection_foot) {
        const obj = JSON.parse(page.codeinjection_foot);
        if (obj && Array.isArray(obj.respuestas)) { store = { v: 1, respuestas: obj.respuestas }; return store; }
      }
    } catch (e) { /* 404 = todavía no existe */ }
    store = { v: 1, respuestas: [] };
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
    // Sólo un 404 significa "no existe": tratar un timeout como 404 duplicaría el store.
    if (!/404/.test(e.message)) { console.error(`[encuesta] store ilegible (${e.message}) — no escribo`); return; }
  }
  if (page) {
    await deps.ghostRequest('PUT', `/ghost/api/admin/pages/${page.id}/`, {
      pages: [{ codeinjection_foot: blob, updated_at: page.updated_at }]
    });
  } else {
    await deps.ghostRequest('POST', '/ghost/api/admin/pages/', {
      pages: [{ title: 'Encuesta bajas store (interno — no publicar)', slug: STORE_SLUG, status: 'draft', codeinjection_foot: blob }]
    });
    console.log('[encuesta] store creado');
  }
}

const limpio = (x, n) => String(x == null ? '' : x).replace(/\s+/g, ' ').trim().slice(0, n || 200);

async function responder(req, res) {
  try {
    const origen = req.headers.origin;
    if (origen && !ORIGENES_OK.includes(origen)) return res.status(403).json({ ok: false });
    const b = req.body || {};
    const email = limpio(b.email, 160).toLowerCase();
    if (!email || !tokenValido(email, b.t)) return res.status(403).json({ ok: false, error: 'link inválido' });

    await loadStore();
    if (store.respuestas.length >= MAX_RESPUESTAS) return res.status(507).json({ ok: false });

    const r = {
      email,
      fecha: new Date().toISOString(),
      motivos: Array.isArray(b.motivos) ? b.motivos.slice(0, 10).map(x => limpio(x, 120)) : [],
      principal: limpio(b.principal, 120),
      otro: limpio(b.otro, 300),
      lee: limpio(b.lee, 40),
      precio: limpio(b.precio, 40),
      distinto: limpio(b.distinto, MAX_TEXTO)
    };
    // Una respuesta por persona: si vuelve a contestar, se reemplaza la anterior.
    const i = store.respuestas.findIndex(x => x.email === email);
    if (i >= 0) store.respuestas[i] = r; else store.respuestas.push(r);
    await saveStore();
    console.log(`[encuesta] respuesta de ${email} (${r.principal || r.motivos.join('/')})`);
    res.json({ ok: true });
  } catch (e) {
    console.error(`[encuesta] error: ${e.message}`);
    res.status(500).json({ ok: false });
  }
}

async function reporte(req, res) {
  if (!REPORTE_KEY || req.query.key !== REPORTE_KEY) return res.status(403).json({ error: 'forbidden' });
  await loadStore(true);
  const cuenta = (campo) => store.respuestas.reduce((a, r) => {
    const vals = Array.isArray(r[campo]) ? r[campo] : [r[campo]];
    vals.filter(Boolean).forEach(v => { a[v] = (a[v] || 0) + 1; });
    return a;
  }, {});
  res.json({
    total: store.respuestas.length,
    motivos: cuenta('motivos'),
    principal: cuenta('principal'),
    lee: cuenta('lee'),
    precio: cuenta('precio'),
    textos: store.respuestas.filter(r => r.distinto || r.otro).map(r => ({ email: r.email, otro: r.otro, distinto: r.distinto })),
    respuestas: req.query.detalle ? store.respuestas : undefined
  });
}

module.exports = { init, responder, reporte, token, loadStore };
