/**
 * x-bot.js — Publica en X (Twitter) cada nota nueva en español.
 *
 * Se cuelga del webhook de Ghost que ya dispara con cada publicación
 * (el mismo de hreflang / traducciones / focal).
 *
 * Alcance decidido: SOLO ES, SOLO publicar. Nada de replies, follows ni DMs.
 * Formato: título + excerpt + link.
 *
 * Apagado por defecto. Prende con X_BOT=on + las 4 credenciales.
 * Sin credenciales corre en dry-run: loguea el tuit que hubiera mandado.
 */

const crypto = require('crypto');

// --- Config ---

const X_API_KEY = (process.env.X_API_KEY || '').trim();
const X_API_SECRET = (process.env.X_API_SECRET || '').trim();
const X_ACCESS_TOKEN = (process.env.X_ACCESS_TOKEN || '').trim();
const X_ACCESS_SECRET = (process.env.X_ACCESS_SECRET || '').trim();

const HAS_CREDS = !!(X_API_KEY && X_API_SECRET && X_ACCESS_TOKEN && X_ACCESS_SECRET);
// Tres estados: 'off' (ni se evalúa) · 'dry' (arma el tuit y lo loguea) · 'on' (postea de verdad)
const MODE = (() => {
  const v = (process.env.X_BOT || 'off').trim().toLowerCase();
  if (v !== 'on') return v === 'dry' ? 'dry' : 'off';
  return HAS_CREDS ? 'on' : 'dry'; // X_BOT=on sin credenciales => dry, no crashea
})();

const TWEET_URL = 'https://api.x.com/2/tweets';
const TWEET_MAX = 280;
const URL_WEIGHT = 23; // X cuenta toda URL como 23 chars (t.co), no importa el largo real
const FRESH_WINDOW_MS = 6 * 60 * 60 * 1000; // no tuitear un post publicado hace más de 6h

// --- Estado (en memoria; Render reinicia y se pierde — ver dedupe abajo) ---

const tweeted = new Set();
const stats = { posted: 0, skipped: 0, errors: 0, lastError: null, lastTweet: null };

// --- OAuth 1.0a ---

// RFC 3986: encodeURIComponent deja !*'() sin escapar y OAuth los necesita escapados
function pctEncode(str) {
  return encodeURIComponent(str).replace(/[!*'()]/g, c =>
    '%' + c.charCodeAt(0).toString(16).toUpperCase()
  );
}

function oauthHeader(method, url, extraParams = {}) {
  const params = {
    oauth_consumer_key: X_API_KEY,
    oauth_nonce: crypto.randomBytes(16).toString('hex'),
    oauth_signature_method: 'HMAC-SHA1',
    oauth_timestamp: Math.floor(Date.now() / 1000).toString(),
    oauth_token: X_ACCESS_TOKEN,
    oauth_version: '1.0',
    ...extraParams,
  };

  // El body JSON NO entra en la firma: solo aplica a application/x-www-form-urlencoded
  const paramString = Object.keys(params).sort()
    .map(k => `${pctEncode(k)}=${pctEncode(params[k])}`)
    .join('&');

  const baseString = [method.toUpperCase(), pctEncode(url), pctEncode(paramString)].join('&');
  const signingKey = `${pctEncode(X_API_SECRET)}&${pctEncode(X_ACCESS_SECRET)}`;
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
 * Gate POSITIVO por tag #es. Deliberadamente no es una blacklist de idiomas:
 * el auto-translate publica 6 posts intl por cada nota ES y cada uno vuelve a
 * disparar este webhook. Con allowlist, un idioma nuevo mañana no se cuela solo.
 */
function shouldTweet(post) {
  if (!post) return { ok: false, reason: 'sin post en el payload' };
  if (!post.id) return { ok: false, reason: 'sin id' };

  const status = post.status || 'published';
  if (status !== 'published') return { ok: false, reason: `status=${status}` };

  if (post.visibility && post.visibility !== 'public') {
    return { ok: false, reason: `visibility=${post.visibility} (no se difunde contenido gateado)` };
  }

  const tags = (post.tags || []).map(t => (t.slug || '').toLowerCase());
  if (!tags.includes('hash-es')) {
    const lang = tags.find(t => /^hash-(en|pt|fr|zh|ja|ko|tr)$/.test(t));
    return { ok: false, reason: lang ? `es ${lang.replace('hash-', '').toUpperCase()}, no ES` : 'sin tag #es' };
  }

  if (!post.url) return { ok: false, reason: 'sin url' };
  if (!post.title) return { ok: false, reason: 'sin título' };

  // Dedupe en memoria: cubre el reintento inmediato de Ghost, que es el caso real
  if (tweeted.has(post.id)) return { ok: false, reason: 'ya tuiteado en esta instancia' };

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

async function postTweet(text) {
  const res = await fetch(TWEET_URL, {
    method: 'POST',
    headers: {
      Authorization: oauthHeader('POST', TWEET_URL),
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
 * Entry point desde el webhook. Fire-and-forget: nunca tira para arriba,
 * un fallo de X no puede romper hreflang ni las traducciones.
 */
async function handlePublish(payload) {
  if (MODE === 'off') return { status: 'off' };

  const post = payload?.post?.current;
  const gate = shouldTweet(post);
  if (!gate.ok) {
    stats.skipped++;
    console.log(`[x-bot] skip: ${gate.reason}${post?.slug ? ` (${post.slug})` : ''}`);
    return { status: 'skipped', reason: gate.reason };
  }

  const { text, length } = buildTweet(post);

  if (MODE === 'dry') {
    console.log(`[x-bot] DRY RUN (${length}/${TWEET_MAX}) — no se publicó:\n---\n${text}\n---`);
    return { status: 'dry-run', text, length };
  }

  // Marcamos ANTES de postear: si X responde con timeout pero el tuit entró,
  // un reintento no puede duplicarlo.
  tweeted.add(post.id);

  try {
    const result = await postTweet(text);
    const id = result?.data?.id;
    stats.posted++;
    stats.lastTweet = { id, slug: post.slug, at: new Date().toISOString() };
    console.log(`[x-bot] publicado: ${post.slug} → https://x.com/421net/status/${id}`);
    return { status: 'posted', tweetId: id, text, length };
  } catch (err) {
    stats.errors++;
    stats.lastError = { msg: err.message, slug: post.slug, at: new Date().toISOString() };

    // 403 duplicate = X rechazó texto idéntico. Es la red de seguridad final
    // contra duplicados y no es un error que haya que mirar.
    if (err.status === 403 && /duplicate/i.test(err.message)) {
      console.log(`[x-bot] X lo rechazó por duplicado (${post.slug}) — ya estaba publicado`);
      return { status: 'duplicate', slug: post.slug };
    }

    tweeted.delete(post.id); // falló de verdad: que un reintento pueda volver a probar
    console.error(`[x-bot] error publicando ${post.slug}: ${err.message}`);
    return { status: 'error', error: err.message };
  }
}

module.exports = {
  MODE,
  HAS_CREDS,
  stats,
  handlePublish,
  buildTweet,
  shouldTweet,
  weightedLength,
};
