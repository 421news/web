'use strict';

// Gate real del número del mes de la Revista 421.
//
// Ghost sirve /content/files/*.pdf público y sin auth de ningún tipo (verificado con
// curl: el PDF baja sin cookie, con un 301 a storage.ghost.io). Por eso el número que
// todavía no se liberó NO puede quedar como file card en la página: revista.js fetchea
// ese HTML por Content API sin login, así que la URL del PDF viajaría a cualquiera que
// mire el código fuente. El "Registrate para descargar" que había era un preventDefault
// con el link real al lado, en un data-attribute.
//
// Flujo, disparado por el webhook page.published.edited de Ghost al guardar la página:
//   1. El número más nuevo pierde su file card → la URL queda guardada en un store privado.
//   2. El que estaba gateado el mes anterior recupera su file card → queda liberado solo.
//   3. El PDF gateado se sirve por GET /api/revista/descarga/:numero, previa verificación
//      del member contra el JWT firmado por Ghost.
//
// La página sigue mostrando tapa + título + créditos del número nuevo — esa es la vidriera
// para el que no paga — pero sin el archivo.
//
// El usuario no corre nada: sube la edición en el editor de Ghost como siempre.

const https = require('https');

const STORE_SLUG = 'revista-gate-store';
const PAGE_SLUG = 'revista-421';

let deps = null;       // { ghostRequest, verifyMemberToken, emailFromClaims }
let store = null;      // { gated: {numero, node, capturedAt} | null, history: [] }
let syncing = false;   // nuestro propio PUT re-dispara el webhook: evita reentrada
let lastResult = null;

function init(d) { deps = d; }

// --- Store privado (página draft de Ghost, mismo patrón que revenue-data-store) ---
// NOTA: ghostRequest devuelve el body parseado y TIRA en cualquier no-2xx (incluido 404).

async function loadStore(force) {
  if (store && !force) return store;
  try {
    const data = await deps.ghostRequest('GET', `/ghost/api/admin/pages/slug/${STORE_SLUG}/`);
    const page = data && data.pages && data.pages[0];
    if (page && page.codeinjection_foot) {
      const obj = JSON.parse(page.codeinjection_foot);
      // Solo confiamos en un store bien formado: si está corrupto preferimos arrancar de
      // cero (y que el cron re-capture) antes que servir un nodo inválido.
      if (obj && (obj.gated === null || (obj.gated && typeof obj.gated.numero === 'number' && obj.gated.node))) {
        store = { gated: obj.gated || null, history: Array.isArray(obj.history) ? obj.history : [] };
        return store;
      }
    }
  } catch (e) { /* 404 = todavía no existe */ }
  store = { gated: null, history: [] };
  return store;
}

async function saveStore() {
  const blob = JSON.stringify(store);
  let page = null;
  try {
    const data = await deps.ghostRequest('GET', `/ghost/api/admin/pages/slug/${STORE_SLUG}/`);
    page = data && data.pages && data.pages[0];
  } catch (e) { page = null; }
  if (page) {
    await deps.ghostRequest('PUT', `/ghost/api/admin/pages/${page.id}/`, {
      pages: [{ codeinjection_foot: blob, updated_at: page.updated_at }]
    });
  } else {
    await deps.ghostRequest('POST', '/ghost/api/admin/pages/', {
      pages: [{ title: 'Revista gate store (interno — no publicar)', slug: STORE_SLUG, status: 'draft', codeinjection_foot: blob }]
    });
    console.log('[revista-gate] store creado');
  }
}

// --- Parseo del Lexical de la página ---
// La página es un array plano y repetitivo: extended-heading, image, file, horizontalrule
// por cada edición. Agrupamos por heading, que es lo único que trae el número.

function extractText(node) {
  if (!node) return '';
  if (typeof node.text === 'string') return node.text;
  if (Array.isArray(node.children)) return node.children.map(extractText).join('');
  return '';
}

function parseIssues(children) {
  const issues = [];
  let cur = null;
  children.forEach((node, idx) => {
    if (node.type === 'extended-heading' || node.type === 'heading') {
      const m = extractText(node).match(/#\s*(\d+)/);
      if (m) {
        cur = { numero: parseInt(m[1], 10), headingIdx: idx, imageIdx: null, fileIdx: null };
        issues.push(cur);
        return;
      }
    }
    if (!cur) return;
    if (node.type === 'image' && cur.imageIdx === null) cur.imageIdx = idx;
    if (node.type === 'file' && cur.fileIdx === null) cur.fileIdx = idx;
  });
  return issues;
}

function newestOf(issues) {
  return issues.reduce((a, b) => (b.numero > a.numero ? b : a));
}

// --- Sincronización de la página ---
// Idempotente a propósito: el PUT que hacemos acá vuelve a disparar el webhook de Ghost,
// y esa segunda corrida no encuentra nada que hacer y no escribe. Sin eso, loop infinito.

async function syncPage(reason) {
  if (!deps) throw new Error('revista-gate sin init()');
  if (syncing) return { skipped: 'sync ya en curso' };
  syncing = true;
  try {
    await loadStore(true);

    const data = await deps.ghostRequest('GET', `/ghost/api/admin/pages/slug/${PAGE_SLUG}/?formats=lexical`);
    const page = data && data.pages && data.pages[0];
    if (!page || !page.lexical) throw new Error(`página ${PAGE_SLUG} sin lexical`);

    const lex = JSON.parse(page.lexical);
    const children = lex.root && lex.root.children;
    if (!Array.isArray(children)) throw new Error('lexical sin root.children');

    let issues = parseIssues(children);
    if (!issues.length) throw new Error('no se encontró ninguna edición en la página');

    const actions = [];
    const newestNum = newestOf(issues).numero;

    // 1. Liberar el gateado del mes pasado: le devolvemos su file card a la página.
    if (store.gated && store.gated.numero !== newestNum) {
      const target = issues.find(i => i.numero === store.gated.numero);
      if (target && target.fileIdx === null) {
        const at = (target.imageIdx !== null ? target.imageIdx : target.headingIdx) + 1;
        children.splice(at, 0, store.gated.node);
        actions.push(`liberado #${store.gated.numero}`);
      } else {
        actions.push(`#${store.gated.numero} ya estaba en la página`);
      }
      store.history.unshift({ numero: store.gated.numero, liberadoEl: new Date().toISOString() });
      store.history = store.history.slice(0, 24);
      store.gated = null;
    }

    // 2. Sacar el file card del número más nuevo y quedárnoslo. Re-parseamos porque el
    //    splice de arriba corrió todos los índices.
    issues = parseIssues(children);
    const newest = newestOf(issues);
    if (newest.fileIdx !== null) {
      store.gated = {
        numero: newest.numero,
        node: children[newest.fileIdx],
        capturedAt: new Date().toISOString()
      };
      children.splice(newest.fileIdx, 1);
      actions.push(`gateado #${newest.numero}`);
    }

    if (actions.length) {
      await deps.ghostRequest('PUT', `/ghost/api/admin/pages/${page.id}/`, {
        pages: [{ lexical: JSON.stringify(lex), updated_at: page.updated_at }]
      });
      await saveStore();
    }

    lastResult = {
      at: new Date().toISOString(),
      reason,
      actions,
      gated: store.gated ? store.gated.numero : null
    };
    console.log(`[revista-gate] ${reason}: ${actions.length ? actions.join(', ') : 'sin cambios'} · gateado=${lastResult.gated || 'ninguno'}`);
    return lastResult;
  } finally {
    syncing = false;
  }
}

// --- Verificación del member ---

// comped == paga. 216 de los ~225 que pagan figuran comped porque cobran por MercadoPago,
// que es externo a Ghost. Chequear solo status:'paid' dejaría afuera al 96% de los wizards.
async function isPaidMember(claims) {
  const email = await deps.emailFromClaims(claims);
  if (!email || /['"\\]/.test(email)) return false; // comilla en el email rompería el NQL
  const r = await deps.ghostRequest('GET', `/ghost/api/admin/members/?filter=${encodeURIComponent(`email:'${email}'`)}&limit=1`);
  const m = r && r.members && r.members[0];
  if (!m) return false;
  return m.status === 'paid' || m.status === 'comped';
}

// --- Descarga ---

function pipeUpstream(url, res, fileName, depth) {
  if (depth > 3) { res.status(502).json({ error: 'demasiados redirects' }); return; }
  https.get(url, (up) => {
    // /content/files/ hace 301 a storage.ghost.io: hay que seguirlo a mano.
    if (up.statusCode >= 300 && up.statusCode < 400 && up.headers.location) {
      up.resume();
      pipeUpstream(new URL(up.headers.location, url).toString(), res, fileName, depth + 1);
      return;
    }
    if (up.statusCode !== 200) {
      up.resume();
      res.status(502).json({ error: `upstream ${up.statusCode}` });
      return;
    }
    res.set('Content-Type', 'application/pdf');
    if (up.headers['content-length']) res.set('Content-Length', up.headers['content-length']);
    res.set('Content-Disposition', `attachment; filename="${String(fileName).replace(/[""\\]/g, '')}"`);
    res.set('Cache-Control', 'private, no-store'); // nunca en una cache compartida
    up.pipe(res);
  }).on('error', (e) => {
    if (!res.headersSent) res.status(502).json({ error: e.message });
  });
}

function cors(res) {
  res.set('Access-Control-Allow-Origin', 'https://www.421.news');
  res.set('Vary', 'Origin');
}

// GET /api/revista/estado → qué número está gateado. Público a propósito: es el dato que
// revista.js necesita para dibujar el candado, y no revela ninguna URL.
function estado(req, res) {
  cors(res);
  loadStore()
    .then(() => res.json({ gated: store.gated ? store.gated.numero : null, lastSync: lastResult }))
    .catch(e => res.status(500).json({ error: e.message }));
}

// GET /api/revista/descarga/:numero → el PDF, solo si el member paga.
async function descargar(req, res) {
  cors(res);
  const numero = parseInt(req.params.numero, 10);
  if (!Number.isFinite(numero)) { res.status(400).json({ error: 'numero inválido' }); return; }
  try {
    await loadStore();
    // Los liberados no pasan por acá: se bajan directo del file card de la página.
    if (!store.gated || store.gated.numero !== numero) {
      res.status(404).json({ error: 'ese número no está gateado' });
      return;
    }
    let claims = null;
    try { claims = await deps.verifyMemberToken(req); } catch (e) { claims = null; }
    if (!claims) { res.status(401).json({ error: 'login requerido' }); return; }
    if (!(await isPaidMember(claims))) { res.status(403).json({ error: 'solo suscriptores' }); return; }

    const node = store.gated.node;
    pipeUpstream(node.src, res, node.fileName || `Revista 421 #${numero}.pdf`, 0);
  } catch (e) {
    if (!res.headersSent) res.status(500).json({ error: e.message });
  }
}

function preflight(req, res) {
  cors(res);
  res.set('Access-Control-Allow-Methods', 'GET');
  res.set('Access-Control-Allow-Headers', 'Authorization, Content-Type');
  res.status(204).end();
}

function status() {
  return { gated: store && store.gated ? store.gated.numero : null, lastSync: lastResult };
}

module.exports = { init, syncPage, estado, descargar, preflight, status };
