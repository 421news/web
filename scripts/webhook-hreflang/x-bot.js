/**
 * x-bot.js — Publica en X (Twitter) cada nota nueva, una cuenta por idioma.
 *
 * Se cuelga del webhook de Ghost que ya dispara con cada publicación
 * (el mismo de hreflang / traducciones / focal).
 *
 * Alcance: SOLO publicar. Nada de replies, follows ni DMs.
 * Formato: título + excerpt + link.
 *
 * Cada cuenta es independiente: su propio interruptor, sus propias credenciales
 * y su propio gate de idioma. Se puede tener ES en `on` y EN en `dry`, o al revés.
 * Apagadas por defecto.
 *
 *   ES  X_BOT=on     + X_API_KEY / X_API_SECRET / X_ACCESS_TOKEN / X_ACCESS_SECRET
 *   EN  X_BOT_EN=on  + X_EN_API_KEY / X_EN_API_SECRET / X_EN_ACCESS_TOKEN / X_EN_ACCESS_SECRET
 *
 * ⚠️ Las credenciales de EN tienen que salir de un app creada DESDE la cuenta en
 * inglés. Los access token quedan atados a la cuenta que los genera, no al app:
 * reusar los de @421net publicaría las notas en inglés en la cuenta en castellano.
 */

const crypto = require('crypto');

// --- Config ---

function leerCuenta({ id, tag, modeEnv, prefix, handleEnv, handleDefault }) {
  const creds = {
    apiKey: (process.env[prefix + 'API_KEY'] || '').trim(),
    apiSecret: (process.env[prefix + 'API_SECRET'] || '').trim(),
    accessToken: (process.env[prefix + 'ACCESS_TOKEN'] || '').trim(),
    accessSecret: (process.env[prefix + 'ACCESS_SECRET'] || '').trim(),
  };
  const hasCreds = !!(creds.apiKey && creds.apiSecret && creds.accessToken && creds.accessSecret);
  // Tres estados: 'off' (ni se evalúa) · 'dry' (arma el tuit y lo loguea) · 'on' (postea)
  const v = (process.env[modeEnv] || 'off').trim().toLowerCase();
  const mode = v !== 'on' ? (v === 'dry' ? 'dry' : 'off') : (hasCreds ? 'on' : 'dry');
  return {
    id, tag, mode, hasCreds, creds,
    handle: (process.env[handleEnv] || handleDefault || '').trim().replace(/^@/, ''),
    tweeted: new Set(),
    stats: { posted: 0, skipped: 0, errors: 0, lastError: null, lastTweet: null },
  };
}

const CUENTAS = [
  leerCuenta({ id: 'es', tag: 'hash-es', modeEnv: 'X_BOT',    prefix: 'X_',    handleEnv: 'X_HANDLE',    handleDefault: '421net' }),
  leerCuenta({ id: 'en', tag: 'hash-en', modeEnv: 'X_BOT_EN', prefix: 'X_EN_', handleEnv: 'X_EN_HANDLE', handleDefault: '' }),
];

// Compatibilidad con lo que ya lee server.js (endpoint de estado y gate del webhook)
const MODE = CUENTAS.every(c => c.mode === 'off') ? 'off' : CUENTAS.map(c => `${c.id}:${c.mode}`).join(' ');
const HAS_CREDS = CUENTAS.some(c => c.hasCreds);
const stats = Object.fromEntries(CUENTAS.map(c => [c.id, c.stats]));

const TWEET_URL = 'https://api.x.com/2/tweets';
const TWEET_MAX = 280;
const URL_WEIGHT = 23; // X cuenta toda URL como 23 chars (t.co), no importa el largo real
const FRESH_WINDOW_MS = 6 * 60 * 60 * 1000; // no tuitear un post publicado hace más de 6h

// El estado (dedupe + stats) vive por cuenta, en memoria: Render reinicia y se
// pierde, por eso ademas esta la ventana de frescura del gate.

// --- OAuth 1.0a ---

// RFC 3986: encodeURIComponent deja !*'() sin escapar y OAuth los necesita escapados
function pctEncode(str) {
  return encodeURIComponent(str).replace(/[!*'()]/g, c =>
    '%' + c.charCodeAt(0).toString(16).toUpperCase()
  );
}

function oauthHeader(creds, method, url, extraParams = {}) {
  const params = {
    oauth_consumer_key: creds.apiKey,
    oauth_nonce: crypto.randomBytes(16).toString('hex'),
    oauth_signature_method: 'HMAC-SHA1',
    oauth_timestamp: Math.floor(Date.now() / 1000).toString(),
    oauth_token: creds.accessToken,
    oauth_version: '1.0',
    ...extraParams,
  };

  // El body JSON NO entra en la firma: solo aplica a application/x-www-form-urlencoded
  const paramString = Object.keys(params).sort()
    .map(k => `${pctEncode(k)}=${pctEncode(params[k])}`)
    .join('&');

  const baseString = [method.toUpperCase(), pctEncode(url), pctEncode(paramString)].join('&');
  const signingKey = `${pctEncode(creds.apiSecret)}&${pctEncode(creds.accessSecret)}`;
  const signature = crypto.createHmac('sha1', signingKey).update(baseString).digest('base64');

  const header = { ...params, oauth_signature: signature };
  return 'OAuth ' + Object.keys(header).sort()
    .map(k => `${pctEncode(k)}="${pctEncode(header[k])}"`)
    .join(', ');
}

// --- Armado del tuit ---

// X pesa los CJK y algunos símbolos doble; para español todo pesa 1.
// Contamos por code point (no por UTF-16) para no romper con emoji.
function weightedLength(text) {
  let len = 0;
  for (const ch of text) {
    const cp = ch.codePointAt(0);
    // Rangos que X cuenta doble (CJK, Hiragana/Katakana, Hangul, emoji)
    const isWide =
      (cp >= 0x1100 && cp <= 0x115F) || (cp >= 0x2E80 && cp <= 0xA4CF) ||
      (cp >= 0xAC00 && cp <= 0xD7A3) || (cp >= 0xF900 && cp <= 0xFAFF) ||
      (cp >= 0xFE30 && cp <= 0xFE6F) || (cp >= 0xFF00 && cp <= 0xFF60) ||
      (cp >= 0x1F300 && cp <= 0x1FAFF);
    len += isWide ? 2 : 1;
  }
  return len;
}

function truncateAtWord(text, maxLen) {
  if (weightedLength(text) <= maxLen) return text;
  const chars = [...text];
  let out = '';
  for (const ch of chars) {
    if (weightedLength(out + ch) > maxLen - 1) break; // -1 para el "…"
    out += ch;
  }
  const lastSpace = out.lastIndexOf(' ');
  if (lastSpace > maxLen * 0.5) out = out.slice(0, lastSpace);
  return out.replace(/[\s.,;:!¡?¿—-]+$/, '') + '…';
}

/**
 * Arma el tuit: título + excerpt + link, recortando el excerpt si no entra.
 * Devuelve { text, length } donde length es el peso que X le va a contar.
 */
function buildTweet(post) {
  const title = (post.title || '').trim();
  const url = (post.url || '').trim();
  const rawExcerpt = (post.custom_excerpt || post.excerpt || '')
    .replace(/\s+/g, ' ')
    .trim();

  // Presupuesto: 280 - link(23) - separadores ("\n\n" dos veces = 4)
  const budget = TWEET_MAX - URL_WEIGHT - 4;

  let finalTitle = title;
  let finalExcerpt = rawExcerpt;

  if (weightedLength(finalTitle) > budget) {
    // Caso patológico: el título solo ya no entra. Se recorta y el excerpt se va.
    finalTitle = truncateAtWord(finalTitle, budget);
    finalExcerpt = '';
  } else {
    const left = budget - weightedLength(finalTitle);
    if (weightedLength(finalExcerpt) > left) {
      // Si queda demasiado poco para un excerpt legible, mejor sin excerpt
      finalExcerpt = left < 40 ? '' : truncateAtWord(finalExcerpt, left);
    }
  }

  const text = finalExcerpt
    ? `${finalTitle}\n\n${finalExcerpt}\n\n${url}`
    : `${finalTitle}\n\n${url}`;

  // Peso real: el texto sin la URL, más los 23 fijos que X le asigna
  const length = weightedLength(text.replace(url, '')) + URL_WEIGHT;
  return { text, length };
}

// --- Gate: ¿esta publicación se tuitea? ---

/**
 * Gate POSITIVO por el tag de idioma de la cuenta (#es o #en). Deliberadamente no
 * es una blacklist: el auto-translate publica 6 posts intl por cada nota ES y cada
 * uno vuelve a disparar este webhook. Con allowlist, un idioma nuevo mañana no se
 * cuela solo, y cada cuenta solo ve lo suyo.
 */
function shouldTweet(post, cuenta) {
  if (!post) return { ok: false, reason: 'sin post en el payload' };
  if (!post.id) return { ok: false, reason: 'sin id' };

  const status = post.status || 'published';
  if (status !== 'published') return { ok: false, reason: `status=${status}` };

  if (post.visibility && post.visibility !== 'public') {
    return { ok: false, reason: `visibility=${post.visibility} (no se difunde contenido gateado)` };
  }

  const esperado = (cuenta && cuenta.tag) || 'hash-es';
  const idioma = esperado.replace('hash-', '').toUpperCase();
  const tags = (post.tags || []).map(t => (t.slug || '').toLowerCase());
  if (!tags.includes(esperado)) {
    const lang = tags.find(t => /^hash-(es|en|pt|fr|zh|ja|ko|tr)$/.test(t));
    return { ok: false, reason: lang ? `es ${lang.replace('hash-', '').toUpperCase()}, no ${idioma}` : `sin tag #${esperado.replace('hash-', '')}` };
  }

  if (!post.url) return { ok: false, reason: 'sin url' };
  if (!post.title) return { ok: false, reason: 'sin título' };

  // Dedupe en memoria: cubre el reintento inmediato de Ghost, que es el caso real
  if (cuenta && cuenta.tweeted.has(post.id)) return { ok: false, reason: 'ya tuiteado en esta instancia' };

  // Guard de frescura: si Render reinicia y algo reprocesa un webhook viejo,
  // el Set está vacío y sin esto se retuitearía media historia del sitio.
  const publishedAt = post.published_at ? new Date(post.published_at).getTime() : null;
  if (!publishedAt || Number.isNaN(publishedAt)) return { ok: false, reason: 'sin published_at válido' };
  const age = Date.now() - publishedAt;
  if (age > FRESH_WINDOW_MS) {
    return { ok: false, reason: `publicado hace ${Math.round(age / 3600000)}h (>6h, se asume reproceso)` };
  }

  return { ok: true };
}

// --- Publicación ---

async function postTweet(creds, text) {
  const res = await fetch(TWEET_URL, {
    method: 'POST',
    headers: {
      Authorization: oauthHeader(creds, 'POST', TWEET_URL),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ text }),
  });

  const body = await res.text();
  if (!res.ok) {
    const err = new Error(`X API ${res.status}: ${body.slice(0, 300)}`);
    err.status = res.status;
    throw err;
  }
  try { return JSON.parse(body); } catch { return { raw: body }; }
}

/**
 * Publica una nota en UNA cuenta. Nunca tira para arriba.
 */
async function publicarEn(cuenta, post) {
  const gate = shouldTweet(post, cuenta);
  if (!gate.ok) {
    cuenta.stats.skipped++;
    console.log(`[x-bot:${cuenta.id}] skip: ${gate.reason}${post?.slug ? ` (${post.slug})` : ''}`);
    return { cuenta: cuenta.id, status: 'skipped', reason: gate.reason };
  }

  const { text, length } = buildTweet(post);

  if (cuenta.mode === 'dry') {
    console.log(`[x-bot:${cuenta.id}] DRY RUN (${length}/${TWEET_MAX}) — no se publicó:\n---\n${text}\n---`);
    return { cuenta: cuenta.id, status: 'dry-run', text, length };
  }

  // Marcamos ANTES de postear: si X responde con timeout pero el tuit entró,
  // un reintento no puede duplicarlo.
  cuenta.tweeted.add(post.id);

  try {
    const result = await postTweet(cuenta.creds, text);
    const id = result?.data?.id;
    cuenta.stats.posted++;
    cuenta.stats.lastTweet = { id, slug: post.slug, at: new Date().toISOString() };
    const link = cuenta.handle ? `https://x.com/${cuenta.handle}/status/${id}` : `tweet ${id}`;
    console.log(`[x-bot:${cuenta.id}] publicado: ${post.slug} → ${link}`);
    return { cuenta: cuenta.id, status: 'posted', tweetId: id, text, length };
  } catch (err) {
    cuenta.stats.errors++;
    cuenta.stats.lastError = { msg: err.message, slug: post.slug, at: new Date().toISOString() };

    // 403 duplicate = X rechazó texto idéntico. Es la red de seguridad final
    // contra duplicados y no es un error que haya que mirar.
    if (err.status === 403 && /duplicate/i.test(err.message)) {
      console.log(`[x-bot:${cuenta.id}] X lo rechazó por duplicado (${post.slug}) — ya estaba publicado`);
      return { cuenta: cuenta.id, status: 'duplicate', slug: post.slug };
    }

    cuenta.tweeted.delete(post.id); // falló de verdad: que un reintento pueda volver a probar
    console.error(`[x-bot:${cuenta.id}] error publicando ${post.slug}: ${err.message}`);
    return { cuenta: cuenta.id, status: 'error', error: err.message };
  }
}

/**
 * Entry point desde el webhook. Fire-and-forget: nunca tira para arriba,
 * un fallo de X no puede romper hreflang ni las traducciones.
 *
 * Recorre TODAS las cuentas encendidas. Una nota tiene un solo tag de idioma,
 * así que en la práctica entra por una sola; el resto la saltea en el gate.
 */
async function handlePublish(payload) {
  const activas = CUENTAS.filter(c => c.mode !== 'off');
  if (!activas.length) return { status: 'off' };

  const post = payload?.post?.current;
  const resultados = [];
  for (const cuenta of activas) {
    resultados.push(await publicarEn(cuenta, post));
  }
  const publicado = resultados.find(r => r.status === 'posted' || r.status === 'dry-run');
  return { status: publicado ? publicado.status : (resultados[0]?.status || 'skipped'), resultados };
}

/** Estado por cuenta, para el endpoint de salud. */
function estado() {
  return CUENTAS.map(c => ({
    cuenta: c.id, idioma: c.tag.replace('hash-', ''), modo: c.mode,
    credenciales: c.hasCreds, handle: c.handle || null, stats: c.stats,
  }));
}

module.exports = {
  MODE,
  HAS_CREDS,
  CUENTAS,
  stats,
  estado,
  handlePublish,
  buildTweet,
  shouldTweet,
  weightedLength,
};
