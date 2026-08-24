const express = require('express');
const jwt = require('jsonwebtoken');
const https = require('https');
const crypto = require('crypto');

const app = express();
app.use(express.json());

// --- Config from env vars ---
const GHOST_ADMIN_KEY = process.env.GHOST_ADMIN_KEY;
const GHOST_CONTENT_KEY = process.env.GHOST_CONTENT_KEY;
const GHOST_URL = process.env.GHOST_URL; // e.g. https://421bn.ghost.io
const PORT = process.env.PORT || 10000;
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const AUTO_TRANSLATE_ENABLED = !!ANTHROPIC_API_KEY;
const MP_TOKEN = process.env.MERCADOPAGO_ACCESS_TOKEN;
const REVENUE_ENABLED = !!(MP_TOKEN && GHOST_ADMIN_KEY);

// Bot de X: publica cada nota nueva en español. Apagado salvo X_BOT=on|dry
const xBot = require('./x-bot');
const C = require('./hreflang-cluster');
const curaduria = require('./curaduria');

// Gate del número del mes de la Revista 421 (saca el PDF nuevo del HTML público y lo sirve
// verificando al member). init() más abajo, cuando ya existen las deps que le pasamos.
const revistaGate = require('./revista-gate');

// --- Ghost API helpers ---

function makeJWT() {
  const [id, secret] = GHOST_ADMIN_KEY.split(':');
  return jwt.sign({}, Buffer.from(secret, 'hex'), {
    keyid: id,
    algorithm: 'HS256',
    expiresIn: '5m',
    audience: '/admin/'
  });
}

function ghostRequest(method, path, body) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, GHOST_URL);
    const token = makeJWT();
    const headers = { 'Authorization': `Ghost ${token}` };

    let postData;
    if (body) {
      postData = JSON.stringify(body);
      headers['Content-Type'] = 'application/json';
      headers['Content-Length'] = Buffer.byteLength(postData);
    }

    const req = https.request({
      hostname: url.hostname,
      path: url.pathname + url.search,
      method,
      headers
    }, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve(JSON.parse(data));
        } else {
          reject(new Error(`Ghost API ${res.statusCode}: ${data.slice(0, 300)}`));
        }
      });
    });

    req.on('error', reject);
    if (postData) req.write(postData);
    req.end();
  });
}

function contentAPIGet(path) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, GHOST_URL);
    const req = https.request({
      hostname: url.hostname,
      path: url.pathname + url.search,
      method: 'GET'
    }, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve(JSON.parse(data));
        } else {
          reject(new Error(`Content API ${res.statusCode}: ${data.slice(0, 300)}`));
        }
      });
    });
    req.on('error', reject);
    req.end();
  });
}

// --- Pairing algorithm ---
// Venia de scripts/generate-hreflang-sitemap.py, borrado el 2026-08-16 junto con el sitemap
// de hreflang. Esta copia quedo como la unica implementacion: no hay de donde re-derivarla.

function parseTimestamp(tsStr) {
  if (!tsStr) return null;
  return new Date(tsStr).getTime() / 1000;
}

function slugWords(slug, minLen = 4) {
  return new Set(slug.split('-').filter(w => w.length >= minLen));
}

function slugsShareWords(slugA, slugB) {
  const wordsA = slugWords(slugA);
  const wordsB = slugWords(slugB);
  for (const w of wordsA) {
    if (wordsB.has(w)) return true;
  }
  return false;
}

// Score reservado al match que se apoya SOLO en la proximidad temporal, sin solapamiento
// de slug. Es válido cuando hay un único candidato en la ventana y sospechoso cuando hay
// varios: por eso se distingue del 1.0.
const SCORE_SOLO_TEMPORAL = 0.95;

function computeScore(postA, postB) {
  const tsA = parseTimestamp(postA.published_at);
  const tsB = parseTimestamp(postB.published_at);
  if (!tsA || !tsB) return 0;

  const delta = Math.abs(tsA - tsB);
  const MAX_DELTA = 172800; // 48h

  // Beyond 48h: no match
  if (delta > MAX_DELTA) return 0;

  const hasOverlap = slugsShareWords(postA.slug, postB.slug);

  // Publicados con <2 min de diferencia. El slug traducido casi nunca comparte palabras
  // con el original ("como-hacer-pan-casero" vs "how-to-make-homemade-bread"), así que
  // acá el tiempo es la única señal disponible.
  //
  // ⚠️ Se devuelven scores DISTINTOS a propósito: 1.0 si además hay solapamiento de slug
  // (match sólido), 0.95 si el match es SOLO temporal. El caller usa ese 0.95 para
  // detectar ambigüedad — si dos candidatos caen en la misma ventana, el apareo por
  // tiempo es una moneda al aire y hay que abstenerse. Así se cruzaron Bond con
  // Evangelion, Feral House con Daniela D'Adamo y Adicción digital con Cyberciruja:
  // se publicaron en tanda y ganó el primero del loop (auditado 2026-08-08).
  if (delta <= 120) return hasOverlap ? 1.0 : SCORE_SOLO_TEMPORAL;

  if (!hasOverlap) return 0;

  const slugScore = 0.6;

  // Temporal proximity score (0..0.4), linear decay over 48h
  const timeScore = 0.4 * (1 - delta / MAX_DELTA);

  return slugScore + timeScore;
}

// --- Webhook handler ---

/** Un post publicado por slug exacto (o null). */
async function postPorSlug(slug) {
  const d = await ghostRequest('GET', `/ghost/api/admin/posts/?limit=1&include=tags&filter=${encodeURIComponent(`slug:'${slug}'`)}`);
  return (d.posts || [])[0] || null;
}

/** Candidatos a miembros del cluster: comparten prefijo de slug con el ES, más el EN del meta. */
async function candidatosDe(esPost) {
  const d = await ghostRequest('GET', `/ghost/api/admin/posts/?limit=100&include=tags&filter=${encodeURIComponent(`slug:~^'${esPost.slug}'`)}`);
  const out = d.posts || [];
  const enSlug = C.metaValue(esPost.codeinjection_head, 'english-version');
  if (enSlug && !out.some(p => p.slug === enSlug)) {
    const en = await postPorSlug(enSlug);
    if (en) out.push(en);
  }
  return out;
}

/**
 * La nota ES base de cualquier miembro del cluster.
 * EN -> por el meta spanish-version. Intl -> por slug sin el sufijo -N que agrega
 * Ghost al deduplicar, validando published_at (hay 33 slugs ES que ya terminan en -N).
 */
async function notaBaseDe(post) {
  const lang = C.postLang(post);
  if (lang === 'es') return post;
  if (lang === 'en') {
    const esSlug = C.metaValue(post.codeinjection_head, 'spanish-version');
    if (!esSlug) return null;
    const es = await postPorSlug(esSlug);
    return es && C.postLang(es) === 'es' ? es : null;
  }
  const base = post.slug.replace(/-\d+$/, '');
  if (base === post.slug) return null;             // slug traducido: no vinculable
  const es = await postPorSlug(base);
  if (!es || C.postLang(es) !== 'es') return null;
  return es.published_at === post.published_at ? es : null;
}

/**
 * Escribe el set completo de <link hreflang> en TODOS los miembros del cluster.
 *
 * Reemplaza al viejo injectHreflangTags, que solo sabía de ES<->EN y tenía dos
 * defectos graves:
 *   1. Trataba como español todo post sin tag #en, así que a una traducción
 *      PT/FR/ZH/JA/KO/TR le escribía hreflang="es" apuntando a su propia URL.
 *      Dejó 335 posts intl declarando que su versión española era ella misma.
 *   2. Si no encontraba par, hacía strip y dejaba solo el self — o sea BORRABA
 *      un par correcto preexistente. Y como el par se busca entre los 50 posts
 *      más recientes del otro idioma, en una nota vieja nunca lo encontraba.
 * Ahora el par conocido vive en el meta y se respeta; el score solo se usa para
 * descubrir uno nuevo.
 *
 * Idempotente a propósito: nuestro propio PUT puede re-disparar el webhook y la
 * segunda pasada no debe escribir.
 */
async function syncCluster(esPost) {
  const candidatos = await candidatosDe(esPost);
  const { members, conflicts } = C.clusterFrom(esPost, candidatos);

  if (conflicts.length) {
    // Dos posts reclamando el mismo idioma haría un hreflang inválido (Google
    // exige una sola URL por idioma). Mismo criterio que el apareo AMBIGUO:
    // preferimos no escribir a escribir algo que manda al lector a otra nota.
    console.error(`[hreflang] CONFLICTO en "${esPost.slug}": ${conflicts.map(c => `${c.lang} ${c.a} vs ${c.b}`).join(' | ')} — no sincronizo`);
    return { status: 'conflict', conflicts };
  }

  const links = C.linksFor(members);
  const langs = Object.keys(members);
  let escritos = 0;
  const curado = [];
  for (const lang of langs) {
    const m = members[lang];
    const body = {};

    const nuevo = C.applyToHead(m.codeinjection_head || '', links);
    if (!C.mismoBloque(nuevo, m.codeinjection_head)) body.codeinjection_head = nuevo;

    // La curaduría (Canon + Rutas) viaja en el MISMO PUT que el hreflang: dos
    // escrituras seguidas sobre el mismo post chocarían con el optimistic
    // locking de Ghost (el updated_at que tenemos en mano queda viejo tras la
    // primera), y además duplicarían el webhook de vuelta.
    if (lang !== 'es') {
      const plan = curaduria.planFor(esPost, m);
      if (plan) {
        body.tags = plan.tags;
        curado.push(`${lang}:+${plan.add.length}/-${plan.del.length}`);
      }
    }

    if (!Object.keys(body).length) continue;
    body.updated_at = m.updated_at;
    await ghostRequest('PUT', `/ghost/api/admin/posts/${m.id}/`, { posts: [body] });
    escritos++;
  }
  console.log(`[hreflang] Cluster "${esPost.slug}": ${langs.join(',')} (${escritos} escritos)` +
              (curado.length ? ` | curaduría ${curado.join(' ')}` : ''));
  return { status: 'synced', langs, escritos, curaduria: curado };
}

/** Descubre el par ES<->EN por score y persiste los metas. Solo cuando no hay meta todavía. */
async function descubrirPar(post, postLang) {
  const isEnglish = postLang === 'en';
  const otherLangFilter = isEnglish ? 'tag:-hash-en' : 'tag:hash-en';
  const data = await contentAPIGet(
    `/ghost/api/content/posts/?key=${GHOST_CONTENT_KEY}` +
    `&filter=${encodeURIComponent(otherLangFilter)}` +
    `&limit=50&order=published_at%20desc` +
    `&include=tags&fields=id,slug,title,published_at`
  );
  const candidates = data.posts || [];

  let bestMatch = null, bestScore = 0, empatesTemporales = 0;
  for (const candidate of candidates) {
    const score = computeScore(post, candidate);
    if (score === SCORE_SOLO_TEMPORAL) empatesTemporales++;
    if (score > bestScore) { bestScore = score; bestMatch = candidate; }
  }

  // Guarda contra el apareo por moneda al aire: si el mejor match se apoya SOLO en
  // la proximidad temporal y hay más de un candidato en esa ventana, no hay forma
  // de saber cuál es. Un post sin par se arregla a mano; uno mal apareado manda al
  // lector al artículo equivocado y nadie lo ve.
  if (bestScore === SCORE_SOLO_TEMPORAL && empatesTemporales > 1) {
    console.error(`[hreflang] AMBIGUO: ${empatesTemporales} candidatos en la misma ventana de 2 min y ninguno comparte slug con "${post.slug}". No apareo.`);
    return null;
  }
  if (!bestMatch || bestScore < 0.3) {
    console.log(`[hreflang] Sin par para "${post.slug}" (mejor score: ${bestScore.toFixed(3)})`);
    return null;
  }

  console.log(`[hreflang] Par encontrado: "${bestMatch.title}" (score ${bestScore.toFixed(3)})`);
  const esPost = isEnglish ? bestMatch : post;
  const enPost = isEnglish ? post : bestMatch;
  await escribirMetaPar(esPost, enPost);
  return await postPorSlug(esPost.slug);
}

/** Persiste el par en los metas, que son la fuente única de la relación ES<->EN. */
async function escribirMetaPar(esPost, enPost) {
  for (const [post, name, valor] of [[esPost, 'english-version', enPost.slug], [enPost, 'spanish-version', esPost.slug]]) {
    const full = await ghostRequest('GET', `/ghost/api/admin/posts/${post.id}/`).then(d => d.posts[0]);
    const head = full.codeinjection_head || '';
    if (C.metaValue(head, name) === valor) continue;
    const limpio = head.replace(/<meta\s+name="(?:english|spanish)-version"\s+content="[^"]*"\s*\/?>\s*/gi, '').trim();
    const nuevo = [`<meta name="${name}" content="${valor}" />`, limpio].filter(Boolean).join('\n');
    await ghostRequest('PUT', `/ghost/api/admin/posts/${post.id}/`, {
      posts: [{ codeinjection_head: nuevo, updated_at: full.updated_at }]
    });
  }
}

// --- Webhook handler ---

async function handleWebhook(payload) {
  const raw = payload?.post?.current;
  if (!raw || !raw.id) return { status: 'ignored', reason: 'no post data in payload' };

  const post = await ghostRequest('GET', `/ghost/api/admin/posts/${raw.id}/?include=tags`).then(d => d.posts[0]);
  if (!post) return { status: 'ignored', reason: 'post not found' };
  if (!post.published_at) return { status: 'ignored', reason: 'no published_at' };

  const lang = C.postLang(post);
  console.log(`[hreflang] Post: "${post.title}" (${lang}, slug: ${post.slug})`);

  let esPost = await notaBaseDe(post);

  // Solo se busca par por heurística cuando todavía no hay uno registrado. Si ya
  // existe el meta, manda el meta: es la fuente única y no se pisa con un score.
  if (!esPost && (lang === 'es' || lang === 'en')) {
    esPost = await descubrirPar(post, lang);
  }

  if (!esPost) {
    // Sin nota base: al menos dejarle el self-referencial con su idioma REAL.
    const solo = C.applyToHead(post.codeinjection_head || '', [`<link rel="alternate" hreflang="${lang}" href="${C.SITE}/${lang}/${post.slug}/" />`]);
    if (!C.mismoBloque(solo, post.codeinjection_head)) {
      await ghostRequest('PUT', `/ghost/api/admin/posts/${post.id}/`, {
        posts: [{ codeinjection_head: solo, updated_at: post.updated_at }]
      });
    }
    return { status: 'no-cluster', lang, selfHreflang: true };
  }

  return await syncCluster(esPost);
}

// =============================================================================
// RELATED POSTS ENGINE (TF-IDF + cosine similarity, pure JS)
// =============================================================================

// --- Semantic concept bridges (ported from update-related.py) ---
const CONCEPT_MAP = {
  'pokémon': 'anime manga videojuego franquicia nintendo tcg coleccionable japón otaku',
  'pokemon': 'anime manga videogame franchise nintendo tcg collectible japan otaku',
  'anime': 'manga japón otaku serie animación videojuego japan animation',
  'manga': 'anime japón otaku comic historieta japan',
  'otaku': 'anime manga japón cosplay fujoshi',
  'cosplay': 'anime manga otaku convención fandom',
  'fujoshi': 'anime manga otaku fanfic fandom',
  'jujutsu': 'anime manga shonen japón otaku',
  'frieren': 'anime manga fantasy japón otaku',
  'demon slayer': 'anime manga shonen japón otaku kimetsu',
  'kimetsu': 'anime manga shonen japón otaku',
  'robotech': 'anime mecha japón serie animación',
  'gojira': 'japón kaiju cine película monstruo tokusatsu',
  'godzilla': 'japón kaiju cine película monstruo tokusatsu',
  'ōtomo': 'manga anime akira japón comic',
  'akira': 'manga anime japón cyberpunk',
  'one piece': 'anime manga shonen serie japón',
  'bluey': 'animación serie infantil dibujo cartoon',
  'tcg': 'carta coleccionable trading card magic pokemon videojuego gaming',
  'magic the gathering': 'tcg carta coleccionable draft arena formato torneo',
  'magic': 'tcg carta coleccionable gathering arena draft',
  'mtg': 'tcg magic carta coleccionable gathering',
  'premodern': 'magic tcg carta coleccionable formato',
  'ultimate team': 'tcg carta coleccionable gaming fifa ea',
  'trading card': 'tcg coleccionable magic pokemon carta',
  'videojuego': 'gaming consola juego gamer pixel retro indie',
  'videogame': 'gaming console game gamer pixel retro indie',
  'playstation': 'consola sony videojuego gaming ps1 ps2',
  'nintendo': 'consola videojuego gaming mario pokemon snes nes',
  'snes': 'nintendo consola retro 16bit videojuego',
  'nes': 'nintendo consola retro 8bit videojuego famicom',
  'pixel art': 'retro videojuego indie gaming estético',
  'retrogaming': 'retro videojuego consola nostalgia clásico',
  'elden ring': 'videojuego fromsoftware souls rpg',
  'silent hill': 'videojuego horror terror survival',
  'diablo': 'videojuego rpg blizzard hack slash',
  'starcraft': 'videojuego estrategia blizzard esport',
  'civilization': 'videojuego estrategia turno 4x historia',
  'commandos': 'videojuego estrategia táctica retro',
  'argentum': 'videojuego mmorpg argentino online comunidad',
  'indie': 'videojuego independiente gaming desarrollo',
  'fear hunger': 'videojuego horror dungeon rpg',
  'juegos de mesa': 'tablero tabletop dados cartas familia boardgame hobby',
  'board game': 'tabletop dice cards family boardgame hobby',
  'tabletop': 'mesa tablero boardgame dados hobby',
  'warhammer': 'miniatura tabletop mesa figurin games workshop estrategia',
  'space hulk': 'warhammer boardgame tabletop mesa games workshop',
  'maldón': 'juegos mesa tablero familia argentino',
  'rol': 'mesa tabletop rpg dados aventura personaje',
  'metal': 'rock música heavy banda guitarra thrash death doom',
  'thrash': 'metal rock heavy música banda',
  'death metal': 'metal heavy música progresivo banda',
  'punk': 'rock underground indie diy música banda',
  'rock': 'música banda guitarra concierto festival',
  'bluegrass': 'música folk country americana instrumento banjo',
  'noise': 'música experimental sonido underground diy',
  'psicodelia': 'música rock experimental lisérgico droga',
  'psychedelia': 'music rock experimental psychedelic drug',
  'dungeon synth': 'metal música medieval fantasy ambient',
  'babasonicos': 'rock argentino música banda alternativo',
  'black sabbath': 'metal rock heavy música banda ozzy birmingham',
  'comic': 'historieta superhéroe marvel dc manga novela gráfica',
  'comics': 'comic superhero marvel dc manga graphic novel',
  'batman': 'dc comic superhéroe gotham historieta',
  'superman': 'dc comic superhéroe krypton historieta',
  'fantastic four': 'marvel comic superhero team',
  'marvel': 'comic superhéroe avengers spider fantastic',
  'dc': 'comic superhéroe batman superman justice',
  'alan moore': 'comic historieta watchmen swamp thing graphic novel',
  'grant morrison': 'comic superhéroe dc marvel historieta',
  'historieta': 'comic manga superhéroe novela gráfica',
  'lovecraft': 'horror cósmico terror cthulhu weird ficción literatura',
  'horror comic': 'manga terror historieta halloween',
  'película': 'cine film director actor serie',
  'movie': 'cinema film director actor series',
  'slasher': 'horror terror película cine halloween',
  'robocop': 'ciencia ficción cine película cyberpunk',
  'blade runner': 'ciencia ficción cine película cyberpunk',
  'matrix': 'ciencia ficción cine película cyberpunk anime',
  'hackers': 'cine película cyberpunk internet hacker',
  'ia': 'inteligencia artificial machine learning tecnología computadora',
  'ai': 'artificial intelligence machine learning technology computer',
  'linux': 'open source software computadora sistema operativo',
  'quantum': 'computadora tecnología qubit ciencia',
  'crispr': 'genética biotecnología ciencia edición',
  'microchip': 'semiconductor tecnología computadora hardware',
  'internet': 'web digital online red tecnología',
  '4chan': 'internet foro meme cultura online anónimo reddit chan',
  'crypto': 'blockchain bitcoin ethereum descentralizado web3',
  'small web': 'internet protocolo abierto comunidad alternativo',
  'colección': 'coleccionable vintage objeto hobby figura',
  'collection': 'collectible vintage object hobby figure',
  'vintage': 'retro colección nostalgia coleccionable',
  'kenner': 'juguete figura coleccionable alien acción',
  'playmates': 'juguete figura coleccionable tortugas ninja acción',
  'escritor': 'literatura libro novela cuento autor escritura',
  'writer': 'literature book novel story author writing',
  'pynchon': 'literatura novela posmoderno ficción autor',
  'argentino': 'argentina nacional local buenos aires',
  'argentine': 'argentina national local buenos aires',
};

// --- Stopwords ---
const ES_STOP = new Set(['el', 'la', 'los', 'las', 'un', 'una', 'de', 'del', 'en', 'y', 'a', 'por',
  'con', 'para', 'que', 'es', 'se', 'al', 'lo', 'su', 'como', 'más', 'pero', 'sus',
  'le', 'ya', 'o', 'este', 'ha', 'si', 'esta', 'entre', 'cuando', 'sin', 'sobre',
  'ser', 'también', 'me', 'hasta', 'hay', 'donde', 'desde', 'todo', 'nos', 'durante',
  'todos', 'uno', 'les', 'ni', 'otros', 'ese', 'eso', 'ante', 'ellos', 'esto',
  'antes', 'algunos', 'otro', 'otras', 'otra', 'él', 'tanto', 'esa', 'estos',
  'mucho', 'nada', 'muchos', 'poco', 'ella', 'estar', 'algo', 'nosotros']);

const EN_STOP = new Set(['the', 'be', 'to', 'of', 'and', 'a', 'in', 'that', 'have', 'i',
  'it', 'for', 'not', 'on', 'with', 'he', 'as', 'you', 'do', 'at', 'this', 'but',
  'his', 'by', 'from', 'they', 'we', 'say', 'her', 'she', 'or', 'an', 'will', 'my',
  'one', 'all', 'would', 'there', 'their', 'what', 'so', 'up', 'out', 'if', 'about',
  'who', 'get', 'which', 'go', 'me', 'when', 'make', 'can', 'like', 'time', 'no',
  'just', 'him', 'know', 'take', 'people', 'into', 'year', 'your', 'good', 'some',
  'could', 'them', 'see', 'other', 'than', 'then', 'now', 'look', 'only', 'come',
  'its', 'over', 'think', 'also', 'back', 'after', 'use', 'two', 'how', 'our',
  'work', 'first', 'well', 'way', 'even', 'new', 'want', 'because', 'any', 'these',
  'give', 'day', 'most', 'us', 'is', 'was', 'are', 'been', 'has', 'had', 'were']);

// --- TF-IDF engine (pure JS, no dependencies) ---

function tokenize(text) {
  return text.toLowerCase().replace(/[^a-záéíóúüñàèìòùâêîôûäëïöü\w\s-]/g, ' ').split(/\s+/).filter(Boolean);
}

function bigrams(tokens) {
  const result = [];
  for (let i = 0; i < tokens.length - 1; i++) {
    result.push(tokens[i] + ' ' + tokens[i + 1]);
  }
  return result;
}

function expandText(text) {
  const lower = text.toLowerCase();
  const expansions = [];
  for (const [keyword, concepts] of Object.entries(CONCEPT_MAP)) {
    if (lower.includes(keyword)) {
      expansions.push(concepts);
    }
  }
  return text + ' ' + expansions.join(' ');
}

function buildCorpus(posts, stopwords) {
  return posts.map(p => {
    const title = p.title || '';
    const excerpt = (p.custom_excerpt || p.excerpt || '').replace(/<[^>]+>/g, '');
    const tags = (p.tags || []).filter(t => t.visibility === 'public').map(t => t.name).join(' ');
    // Triple-weight title and double-weight tags (same as Python script)
    const text = `${title} ${title} ${title} ${tags} ${tags} ${excerpt}`;
    const expanded = expandText(text);
    const tokens = tokenize(expanded).filter(t => !stopwords.has(t));
    const bi = bigrams(tokens);
    return { slug: p.slug, terms: tokens.concat(bi) };
  });
}

function computeTfIdf(corpus) {
  const N = corpus.length;
  // Document frequency: how many docs contain each term
  const df = {};
  for (const doc of corpus) {
    const seen = new Set(doc.terms);
    for (const term of seen) {
      df[term] = (df[term] || 0) + 1;
    }
  }

  // IDF: log(N / df) — skip terms in >80% of docs or only in 1 doc (if N > 10)
  const idf = {};
  for (const [term, count] of Object.entries(df)) {
    if (count > N * 0.8) continue; // too common
    idf[term] = Math.log(N / count);
  }

  // TF-IDF vectors (sparse: Map of term -> score)
  const vectors = corpus.map(doc => {
    const tf = {};
    for (const term of doc.terms) {
      tf[term] = (tf[term] || 0) + 1;
    }
    const vec = new Map();
    let norm = 0;
    for (const [term, count] of Object.entries(tf)) {
      if (!idf[term]) continue;
      const score = (1 + Math.log(count)) * idf[term]; // sublinear TF
      vec.set(term, score);
      norm += score * score;
    }
    // L2 normalize
    norm = Math.sqrt(norm);
    if (norm > 0) {
      for (const [term, score] of vec) {
        vec.set(term, score / norm);
      }
    }
    return vec;
  });

  return vectors;
}

function cosineSimilarity(vecA, vecB) {
  let dot = 0;
  // Iterate over the smaller vector
  const [smaller, larger] = vecA.size <= vecB.size ? [vecA, vecB] : [vecB, vecA];
  for (const [term, scoreA] of smaller) {
    const scoreB = larger.get(term);
    if (scoreB !== undefined) {
      dot += scoreA * scoreB;
    }
  }
  return dot; // vectors are already L2-normalized
}

function computeRelatedForLang(posts, stopwords) {
  if (posts.length === 0) return {};

  const corpus = buildCorpus(posts, stopwords);
  const vectors = computeTfIdf(corpus);

  const result = {};
  for (let i = 0; i < corpus.length; i++) {
    const scores = [];
    for (let j = 0; j < corpus.length; j++) {
      if (i === j) continue;
      scores.push({ idx: j, score: cosineSimilarity(vectors[i], vectors[j]) });
    }
    scores.sort((a, b) => b.score - a.score);
    result[corpus[i].slug] = scores.slice(0, 4).map(s => corpus[s.idx].slug);
  }
  return result;
}

// --- Related posts state ---
let relatedPostsJSON = {}; // { slug: [slug1, slug2, slug3, slug4] }
let relatedPostsReady = false;
let relatedDebounceTimer = null;

async function fetchAllPostsForRelated() {
  const allPosts = [];
  let page = 1;
  while (true) {
    const data = await contentAPIGet(
      `/ghost/api/content/posts/?key=${GHOST_CONTENT_KEY}` +
      `&page=${page}&limit=100` +
      `&include=tags&fields=slug,title,excerpt,custom_excerpt`
    );
    if (!data.posts || data.posts.length === 0) break;
    allPosts.push(...data.posts);
    if (!data.meta?.pagination?.next) break;
    page++;
  }
  return allPosts;
}

async function recomputeRelatedPosts() {
  console.log('[related] Starting full recompute...');
  const start = Date.now();

  const allPosts = await fetchAllPostsForRelated();
  console.log(`[related] Fetched ${allPosts.length} posts`);

  const esPosts = allPosts.filter(p => (p.tags || []).some(t => t.slug === 'hash-es'));
  const enPosts = allPosts.filter(p => (p.tags || []).some(t => t.slug === 'hash-en'));
  console.log(`[related] ES: ${esPosts.length} | EN: ${enPosts.length}`);

  const esRelated = computeRelatedForLang(esPosts, ES_STOP);
  const enRelated = computeRelatedForLang(enPosts, EN_STOP);

  relatedPostsJSON = { ...esRelated, ...enRelated };
  relatedPostsReady = true;

  const elapsed = ((Date.now() - start) / 1000).toFixed(1);
  console.log(`[related] Done: ${Object.keys(relatedPostsJSON).length} posts mapped in ${elapsed}s`);
}

function scheduleRelatedRecompute() {
  if (relatedDebounceTimer) clearTimeout(relatedDebounceTimer);
  relatedDebounceTimer = setTimeout(() => {
    relatedDebounceTimer = null;
    recomputeRelatedPosts().catch(err => {
      console.error(`[related] Recompute error: ${err.message}`);
    });
  }, 10000); // 10s debounce
}

// Bootstrap: load current JSON from theme asset, then recompute in background
async function bootstrapRelatedPosts() {
  try {
    console.log('[related] Bootstrapping from theme asset...');
    const res = await new Promise((resolve, reject) => {
      https.get('https://www.421.news/assets/data/related-posts.json', (res) => {
        let data = '';
        res.on('data', (chunk) => { data += chunk; });
        res.on('end', () => {
          if (res.statusCode === 200) {
            resolve(JSON.parse(data));
          } else {
            reject(new Error(`HTTP ${res.statusCode}`));
          }
        });
      }).on('error', reject);
    });
    relatedPostsJSON = res;
    relatedPostsReady = true;
    console.log(`[related] Bootstrap loaded ${Object.keys(relatedPostsJSON).length} posts from theme`);
  } catch (err) {
    console.log(`[related] Bootstrap failed (${err.message}), will compute from scratch`);
  }
  // Always recompute fresh in background
  recomputeRelatedPosts().catch(err => {
    console.error(`[related] Initial recompute error: ${err.message}`);
  });
}

// =============================================================================
// FOCAL POINTS (feature-image object-position via Claude vision)
// Calcula el "punto importante" de cada feature image para que object-fit:cover
// no recorte el sujeto. NO cambia aspect ratios. Sirve /api/feature-focal.json.
// Base = asset commiteado del theme (backfill); overlay = posts publicados desde
// el último backfill (se computan por-post al publicar + se rellenan al arrancar).
// El theme (focal-points.js) lo consume; si falla, usa el asset → sin regresión.
// =============================================================================
// Key propia para focal, independiente de ANTHROPIC_API_KEY (que gatea
// auto-translate, apagado a propósito). Si solo está ANTHROPIC_API_KEY, también
// sirve; pero seteando FOCAL_API_KEY se activa focal SIN tocar auto-translate.
const FOCAL_API_KEY = process.env.FOCAL_API_KEY || ANTHROPIC_API_KEY;
const FOCAL_ENABLED = !!FOCAL_API_KEY;
const FOCAL_MODEL = process.env.FOCAL_MODEL || 'claude-sonnet-4-6';
let focalMap = {};       // { "2026/06/foo.webp": "47% 55%" }
let focalReady = false;

const FOCAL_PROMPT = `Esta imagen es la foto de portada de un artículo. Se va a recortar a formatos más angostos y cuadrados (vertical y casi-cuadrado, además de full-screen en distintas pantallas) usando object-fit: cover, que recorta los costados y a veces arriba/abajo.

Identificá el SUJETO MÁS IMPORTANTE de la foto a nivel semántico: aquello de lo que realmente trata la imagen (una persona concreta, un objeto, un cuadro, un rostro, el foco de acción). No el área de mayor contraste, sino el tema.

Devolvé SOLO un objeto JSON, sin texto extra, con el punto que SIEMPRE debe quedar visible al recortar:
{"fx": <entero 0-100, posición horizontal en %>, "fy": <entero 0-100, posición vertical en %>}`;

function focalKey(url) {
  if (!url) return null;
  const i = url.indexOf('/content/images/');
  if (i < 0) return null;
  return url.slice(i + 16).replace(/^size\/[^/]+\//, '').split('?')[0];
}
function focalMediaType(key) {
  const ext = (key.split('.').pop() || '').toLowerCase();
  if (ext === 'png') return 'image/png';
  if (ext === 'webp') return 'image/webp';
  if (ext === 'gif') return 'image/gif';
  return 'image/jpeg';
}
function fetchImageBase64(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      if (res.statusCode !== 200) { res.resume(); reject(new Error('img HTTP ' + res.statusCode)); return; }
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => resolve(Buffer.concat(chunks).toString('base64')));
    }).on('error', reject);
  });
}
function callClaudeVision(base64, mediaType) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({
      model: FOCAL_MODEL,
      max_tokens: 100,
      messages: [{ role: 'user', content: [
        { type: 'image', source: { type: 'base64', media_type: mediaType, data: base64 } },
        { type: 'text', text: FOCAL_PROMPT },
      ]}],
    });
    const req = https.request({
      hostname: 'api.anthropic.com', path: '/v1/messages', method: 'POST',
      headers: {
        'x-api-key': FOCAL_API_KEY,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
        'content-length': Buffer.byteLength(body),
      },
    }, (res) => {
      let data = '';
      res.on('data', (c) => { data += c; });
      res.on('end', () => {
        if (res.statusCode >= 400) { reject(new Error(`Claude ${res.statusCode}: ${data.slice(0, 200)}`)); return; }
        try { resolve(JSON.parse(data).content[0].text); }
        catch (e) { reject(new Error('Claude parse error')); }
      });
    });
    req.on('error', reject);
    req.setTimeout(60000, () => { req.destroy(); reject(new Error('Claude timeout')); });
    req.write(body);
    req.end();
  });
}
async function computeFocal(featureImageUrl) {
  // versión liviana (w800) en el mismo host de storage → sin redirect
  const resized = featureImageUrl.replace('/content/images/', '/content/images/size/w800/');
  const key = focalKey(featureImageUrl);
  const b64 = await fetchImageBase64(resized);
  const txt = (await callClaudeVision(b64, focalMediaType(key)))
    .trim().replace(/^```json?/i, '').replace(/```$/, '').trim();
  const o = JSON.parse(txt);
  const fx = Math.round(Math.min(95, Math.max(5, o.fx)));
  const fy = Math.round(Math.min(95, Math.max(5, o.fy)));
  return `${fx}% ${fy}%`;
}
// Por-post: computa el focal de UNA imagen si todavía no lo tenemos.
async function updateFocalForPost(featureImageUrl) {
  if (!FOCAL_ENABLED) return;
  const key = focalKey(featureImageUrl);
  if (!key || focalMap[key]) return; // ya conocido (base o overlay)
  const pos = await computeFocal(featureImageUrl);
  focalMap[key] = pos;
  console.log(`[focal] ${key} → ${pos}`);
}
// Arranque: cargar base commiteada, luego rellenar posts recientes que falten
// (cubre lo publicado desde el último backfill; sobrevive a restarts de Render).
async function bootstrapFocal() {
  try {
    focalMap = await new Promise((resolve, reject) => {
      https.get('https://www.421.news/assets/data/feature-focal.json', (res) => {
        let d = ''; res.on('data', (c) => { d += c; });
        res.on('end', () => res.statusCode === 200 ? resolve(JSON.parse(d)) : reject(new Error('HTTP ' + res.statusCode)));
      }).on('error', reject);
    });
    console.log(`[focal] Loaded ${Object.keys(focalMap).length} from theme asset`);
  } catch (err) {
    console.log(`[focal] Bootstrap failed (${err.message})`);
  }
  focalReady = true;
  if (!FOCAL_ENABLED) { console.log('[focal] Disabled (no ANTHROPIC_API_KEY) — serving committed base only'); return; }
  // Rellenar los últimos ~50 posts que no estén en la base (normalmente 0-pocos)
  try {
    const list = await new Promise((resolve, reject) => {
      const u = `${GHOST_URL}/ghost/api/content/posts/?key=${GHOST_CONTENT_KEY}&limit=50&fields=feature_image&order=published_at%20desc`;
      https.get(u, (res) => {
        let d = ''; res.on('data', (c) => { d += c; });
        res.on('end', () => res.statusCode === 200 ? resolve(JSON.parse(d)) : reject(new Error('HTTP ' + res.statusCode)));
      }).on('error', reject);
    });
    let filled = 0;
    for (const p of (list.posts || [])) {
      const key = focalKey(p.feature_image);
      if (!p.feature_image || !key || focalMap[key]) continue;
      try { await updateFocalForPost(p.feature_image); filled++; }
      catch (e) { console.log(`[focal] fill ${key}: ${e.message}`); }
    }
    console.log(`[focal] Recent fill: ${filled} new (model ${FOCAL_MODEL})`);
  } catch (err) {
    console.log(`[focal] Recent fill failed: ${err.message}`);
  }
}

// --- Routes ---

// =============================================================================
// AUTO-TRANSLATION ENGINE (ES → 6 intl languages via Claude Haiku)
// =============================================================================

const INTL_LANGS = {
  pt: 'Portuguese (Brazilian)',
  fr: 'French',
  zh: 'Chinese (Simplified)',
  ja: 'Japanese',
  ko: 'Korean',
  tr: 'Turkish'
};

const TAG_MAP_INTL = {
  'juegos': 'games', 'videojuegos': 'video-games', 'libros': 'books',
  'peliculas': 'movies', 'historieta': 'comics', 'filosofia': 'philosophy',
  'cultura': 'culture', 'tecnologia': 'tech', 'tutoriales': 'tutorials',
  'vida-real': 'real-life', 'cripto': 'crypto', 'soberania': 'sovereignty',
  'el-canon': 'the-canon', 'musica': 'music', 'deportes': 'sports',
};
const KEEP_TAGS_INTL = new Set(['argentina', 'memes', 'internet', 'series', 'magic-the-gathering', 'warhammer', 'cannabis']);
const INTERNAL_KEEP_INTL = new Set(['hash-ensayo', 'hash-cronica', 'hash-guia', 'hash-novedades', 'hash-resena', 'hash-entrevista']);

// Tags/slugs to exclude from auto-translation
const EXCLUDE_TAGS_TRANSLATE = new Set(['wiki', 'satelite']);
const EXCLUDE_SLUG_PATTERNS_TRANSLATE = [
  /^revista-421-numero/, /suscribi/, /^email-/, /^re-suscribite/,
  /wizard/, /^renova-/, /^promo-/, /^una-nueva-revista/,
  /^no-pierdas-la-magia/, /^421-se-sostiene/, /^sumate-para-que/,
  /^subi-de-nivel/, /^ultimo-dia-/, /^ultima-chance-/,
];

function callClaudeAPI(prompt, maxTokens) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: maxTokens,
      messages: [{ role: 'user', content: prompt }]
    });
    const req = https.request({
      hostname: 'api.anthropic.com',
      path: '/v1/messages',
      method: 'POST',
      headers: {
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
        'content-length': Buffer.byteLength(body)
      }
    }, (res) => {
      let data = '';
      res.on('data', (c) => { data += c; });
      res.on('end', () => {
        if (res.statusCode >= 400) {
          reject(new Error(`Claude ${res.statusCode}: ${data.slice(0, 300)}`));
        } else {
          try {
            const parsed = JSON.parse(data);
            if (parsed.content && parsed.content[0]) resolve(parsed.content[0].text);
            else reject(new Error('No content in Claude response'));
          } catch (e) { reject(new Error('Claude parse error')); }
        }
      });
    });
    req.on('error', reject);
    req.setTimeout(300000, () => { req.destroy(); reject(new Error('Claude timeout')); });
    req.write(body);
    req.end();
  });
}

function splitHtmlForTranslation(html, maxChunkSize) {
  if (html.length <= maxChunkSize) return [html];
  const chunks = [];
  let remaining = html;
  while (remaining.length > 0) {
    if (remaining.length <= maxChunkSize) { chunks.push(remaining); break; }
    let splitAt = -1;
    const searchEnd = Math.min(remaining.length, maxChunkSize);
    for (const tag of ['</figure>', '</blockquote>', '</ul>', '</ol>', '</p>', '</h2>', '</h3>']) {
      const idx = remaining.lastIndexOf(tag, searchEnd);
      if (idx > maxChunkSize * 0.5) { splitAt = idx + tag.length; break; }
    }
    if (splitAt === -1) splitAt = searchEnd;
    chunks.push(remaining.substring(0, splitAt));
    remaining = remaining.substring(splitAt);
  }
  return chunks;
}

function mapTagsForIntlLang(esTags, lang) {
  const result = [];
  let hasLangTag = false;
  for (const slug of esTags) {
    if (slug === 'hash-es') { result.push({ slug: 'hash-' + lang }); hasLangTag = true; continue; }
    const clean = slug.replace(/^hash-/, '');
    if (INTERNAL_KEEP_INTL.has(slug)) { result.push({ slug }); continue; }
    if (TAG_MAP_INTL[clean]) { result.push({ slug: TAG_MAP_INTL[clean] }); continue; }
    if (KEEP_TAGS_INTL.has(clean)) { result.push({ slug: clean }); continue; }
    result.push({ slug });
  }
  if (!hasLangTag) result.push({ slug: 'hash-' + lang });
  return result;
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

/**
 * Translate a single post to one language and publish it.
 */
async function translateAndPublish(post, lang, langName) {
  const html = post.html || '';
  const CHUNK_SIZE = lang === 'zh' ? 8000 : 12000;

  // Step 1: Translate metadata
  const metaPrompt = `Translate from Spanish to ${langName}. Return ONLY valid JSON, no extra text:
{"title":"translated title","custom_excerpt":"under 250 chars","meta_title":"under 60 chars","meta_description":"under 155 chars"}
Keep proper nouns as-is.

Title: ${post.title}
Excerpt: ${(post.custom_excerpt || '').substring(0, 250)}
Meta title: ${post.meta_title || post.title}
Meta description: ${(post.meta_description || post.custom_excerpt || '').substring(0, 160)}`;

  let metaResp = await callClaudeAPI(metaPrompt, 500);
  metaResp = metaResp.trim().replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
  const meta = JSON.parse(metaResp);

  // Step 2: Translate HTML in chunks
  const chunks = splitHtmlForTranslation(html, CHUNK_SIZE);
  const translatedChunks = [];
  for (let i = 0; i < chunks.length; i++) {
    const resp = await callClaudeAPI(
      `Translate this HTML from Spanish to ${langName}. Return ONLY the translated HTML. Keep ALL HTML tags, attributes, URLs, images unchanged. Only translate visible text. Keep proper nouns as-is.\n\n${chunks[i]}`,
      Math.min(Math.ceil(chunks[i].length / 2) + 2000, 64000)
    );
    let r = resp.trim();
    if (r.startsWith('```')) r = r.replace(/^```(?:html)?\n?/, '').replace(/\n?```$/, '');
    translatedChunks.push(r);
    if (i < chunks.length - 1) await sleep(300);
  }

  // Step 3: Publish to Ghost
  const esTags = (post.tags || []).map(t => t.slug);
  const tags = mapTagsForIntlLang(esTags, lang);

  const postData = {
    title: meta.title,
    slug: post.slug,
    html: translatedChunks.join(''),
    status: 'published',
    published_at: post.published_at,
    feature_image: post.feature_image || null,
    feature_image_alt: post.feature_image_alt || null,
    custom_excerpt: (meta.custom_excerpt || '').substring(0, 300),
    meta_title: (meta.meta_title || '').substring(0, 70),
    meta_description: (meta.meta_description || '').substring(0, 160),
    tags: tags,
    authors: (post.authors || []).map(a => ({ id: a.id, slug: a.slug })),
  };

  const result = await ghostRequest('POST', '/ghost/api/admin/posts/?source=html', { posts: [postData] });
  return result.posts[0];
}

/**
 * Check if a post should be auto-translated.
 * Only ES posts that are not newsletters, promos, or excluded tags.
 */
function shouldAutoTranslate(post) {
  const tags = (post.tags || []).map(t => t.slug);

  // Skip emails. Un post email_only es una campaña, no una nota: traducirlo deja
  // un draft basura por cada envío (y encima con email_only:false, así que si
  // alguien lo publica sale como nota pública). Se acumularon 4 antes de verlo.
  if (post.email_only) return false;
  if (/^auto-/.test(post.slug || '')) return false; // slugs del motor de emails

  // Skip non-ES posts (EN or intl)
  if (tags.includes('hash-en') || tags.some(t => ['hash-pt', 'hash-fr', 'hash-zh', 'hash-ja', 'hash-ko', 'hash-tr'].includes(t))) {
    return false;
  }

  // Skip excluded tags
  if (tags.some(t => EXCLUDE_TAGS_TRANSLATE.has(t.replace(/^hash-/, '')))) return false;

  // Skip newsletters
  if (tags.some(t => t.startsWith('newsletter-'))) return false;

  // Skip excluded slug patterns
  if (EXCLUDE_SLUG_PATTERNS_TRANSLATE.some(re => re.test(post.slug))) return false;

  return true;
}

/**
 * Idiomas que YA tienen traduccion publicada de este post.
 *
 * Por que hace falta: el webhook de Ghost tambien dispara al EDITAR un post ya
 * publicado, y aca no habia ninguna guarda. Una correccion de tipeo en una nota
 * vieja re-traducia las 6 lenguas y dejaba 6 duplicados.
 *
 * La clave es compuesta, y las tres partes son necesarias (medido sobre las 606
 * notas ES y las 493 intl del sitio):
 *   - prefijo de slug: translateAndPublish postea con `slug: post.slug` y Ghost
 *     deduplica agregando -2/-3. Ese sufijo es lo unico que puede sobrar.
 *   - tag de idioma: para no contar la propia ES ni la EN.
 *   - published_at: desempata los 33 slugs ES que terminan en -N, que si no se
 *     confunden con la traduccion deduplicada de OTRO post (ej. la nota ES
 *     `gad-2` vs la traduccion de `gad` que quedo como `gad-2`).
 * published_at sola no alcanza como clave: 27 notas ES comparten el timestamp
 * 2024-09-16T03:01:00Z de una importacion vieja.
 *
 * Residuo conocido: 8 posts TR viejos tienen el slug traducido (los hizo
 * translate-batch.js, no este webhook), asi que no hay forma de vincularlos y
 * la guarda no los ve. Si alguno de esos 8 ES se re-publica, TR se duplica.
 * Cubre 485 de las 493 traducciones existentes.
 */
async function existingTranslations(post) {
  const langs = Object.keys(INTL_LANGS);
  const filter = `slug:~^'${post.slug}'+tag:[${langs.map(l => `hash-${l}`).join(',')}]`;
  const data = await ghostRequest('GET', `/ghost/api/admin/posts/?limit=100&include=tags&filter=${encodeURIComponent(filter)}`);

  const done = new Set();
  for (const p of (data.posts || [])) {
    if (!/^(-\d+)?$/.test(p.slug.slice(post.slug.length))) continue;
    if (p.published_at !== post.published_at) {
      console.log(`[translate] "${p.slug}" comparte prefijo pero no fecha: es traduccion de otro post, no de este`);
      continue;
    }
    for (const t of (p.tags || [])) {
      const m = /^hash-(pt|fr|zh|ja|ko|tr)$/.exec(t.slug);
      if (m) done.add(m[1]);
    }
  }
  return done;
}

/**
 * Auto-translate an ES post to all 6 intl languages.
 * Runs asynchronously (fire-and-forget from webhook).
 * `force` saltea la guarda de ya-traducido (solo por trigger manual).
 */
async function autoTranslatePost(postId, force = false) {
  if (!AUTO_TRANSLATE_ENABLED) return;

  // Fetch the full post with HTML
  const data = await ghostRequest('GET', `/ghost/api/admin/posts/${postId}/?formats=html&include=tags,authors`);
  const post = data.posts[0];

  if (!shouldAutoTranslate(post)) {
    console.log(`[translate] Skipping "${post.title}" (excluded)`);
    return;
  }

  const yaTraducidos = force ? new Set() : await existingTranslations(post);
  if (yaTraducidos.size >= Object.keys(INTL_LANGS).length) {
    console.log(`[translate] "${post.title}" ya tiene las 6 traducciones — nada que hacer`);
    return { ok: 0, fail: 0, skipped: yaTraducidos.size, langs: {} };
  }
  if (yaTraducidos.size) {
    console.log(`[translate] "${post.title}" ya tiene: ${[...yaTraducidos].join(', ')} — solo faltan las otras`);
  }

  console.log(`[translate] Starting auto-translation: "${post.title}" → ${Object.keys(INTL_LANGS).length - yaTraducidos.size} languages`);

  const results = { ok: 0, fail: 0, skipped: yaTraducidos.size, langs: {} };

  for (const [lang, langName] of Object.entries(INTL_LANGS)) {
    if (yaTraducidos.has(lang)) continue;
    let retries = 0;
    while (retries < 2) {
      try {
        const published = await translateAndPublish(post, lang, langName);
        console.log(`[translate] ✓ ${lang}: /${lang}/${published.slug}/`);
        results.ok++;
        results.langs[lang] = published.slug;
        break;
      } catch (err) {
        retries++;
        if (retries >= 2) {
          console.error(`[translate] ✗ ${lang}: ${err.message.substring(0, 100)}`);
          results.fail++;
        } else {
          const wait = err.message.includes('429') ? 30000 : 5000;
          await sleep(wait);
        }
      }
    }
    await sleep(500); // Gentle rate limit between languages
  }

  console.log(`[translate] Done: ${results.ok} ok, ${results.fail} failed, ${results.skipped} ya existian`);

  // Reescribir el hreflang de todo el cluster con las traducciones nuevas adentro.
  // El webhook de publicación de cada traducción ya lo dispara, pero depender de eso
  // deja el set incompleto si Ghost no notifica: acá el estado final queda cerrado
  // en la misma corrida. Es idempotente, así que la doble pasada no escribe dos veces.
  if (results.ok > 0) {
    try {
      const fresco = await ghostRequest('GET', `/ghost/api/admin/posts/${post.id}/?include=tags`).then(d => d.posts[0]);
      await syncCluster(fresco);
    } catch (err) {
      console.error(`[translate] Error sincronizando hreflang del cluster: ${err.message}`);
    }
  }

  return results;
}

// --- Express endpoints ---

app.get('/', (req, res) => {
  res.json({ status: 'ok', service: 'webhook-hreflang', version: '2.6.1', revista: revistaGate.status(), ga4: ga4Data ? 'ready' : 'not loaded', revenue: REVENUE_ENABLED ? (revenueData ? `ready (${revenueData.history.length} weeks)` : 'enabled, loading') : 'disabled', autoTranslate: AUTO_TRANSLATE_ENABLED, focal: FOCAL_ENABLED ? `enabled (${Object.keys(focalMap).length}, ${FOCAL_MODEL})` : `base-only (${Object.keys(focalMap).length})`, xBot: `${xBot.MODE}${xBot.HAS_CREDS ? '' : ' (sin credenciales)'}`, xBotStats: xBot.stats });
});

app.post('/webhook/hreflang', async (req, res) => {
  // Respond immediately so Ghost doesn't timeout
  res.status(200).json({ received: true });

  try {
    const result = await handleWebhook(req.body);
    console.log(`[hreflang] Result: ${JSON.stringify(result)}`);
  } catch (err) {
    console.error(`[hreflang] Webhook error: ${err.message}`);
  }

  // Auto-translate ES posts to 6 intl languages (fire-and-forget)
  if (AUTO_TRANSLATE_ENABLED) {
    const post = req.body?.post?.current;
    if (post && post.id) {
      autoTranslatePost(post.id).catch(err => {
        console.error(`[translate] Error: ${err.message}`);
      });
    }
  }

  // Focal point for this post's feature image (fire-and-forget, only the new one)
  if (FOCAL_ENABLED) {
    const img = req.body?.post?.current?.feature_image;
    if (img) {
      updateFocalForPost(img).catch(err => {
        console.error(`[focal] Publish error: ${err.message}`);
      });
    }
  }

  // Bot de X (fire-and-forget). El gate por tag #es vive adentro: este webhook
  // también dispara con las 6 traducciones intl de cada nota.
  if (xBot.MODE !== 'off') {
    xBot.handlePublish(req.body).catch(err => {
      console.error(`[x-bot] Error: ${err.message}`);
    });
  }
});

// Synchronous test endpoint (returns full result for debugging)
app.post('/test', async (req, res) => {
  try {
    const result = await handleWebhook(req.body);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message, stack: err.stack });
  }
});

// --- Bot de X: preview (no publica nunca) ---

// GET /x-bot/preview?slug=xxx  → muestra el tuit que se armaría para esa nota.
// Sin slug, usa las últimas 5 notas ES. Sirve para ver el formato antes de prender nada.
app.get('/x-bot/preview', async (req, res) => {
  try {
    const slug = (req.query.slug || '').trim();
    let posts;

    if (slug) {
      const data = await ghostRequest('GET',
        `/ghost/api/admin/posts/slug/${encodeURIComponent(slug)}/?include=tags&fields=id,title,slug,url,custom_excerpt,excerpt,published_at,status,visibility`);
      posts = data.posts || [];
    } else {
      const data = await ghostRequest('GET',
        `/ghost/api/admin/posts/?limit=5&order=published_at%20desc&include=tags` +
        `&filter=${encodeURIComponent('status:published+tag:hash-es')}` +
        `&fields=id,title,slug,url,custom_excerpt,excerpt,published_at,status,visibility`);
      posts = data.posts || [];
    }

    if (!posts.length) return res.status(404).json({ error: 'no se encontró el post' });

    const previews = posts.map(p => {
      const gate = xBot.shouldTweet(p);
      const { text, length } = xBot.buildTweet(p);
      return {
        slug: p.slug,
        published_at: p.published_at,
        // El gate real incluye la ventana de 6h, que para un post viejo siempre da false.
        // Acá lo informamos pero no es señal de que el bot esté mal.
        pasaGate: gate.ok,
        motivo: gate.ok ? null : gate.reason,
        chars: `${length}/280`,
        tweet: text,
      };
    });

    res.json({ modo: xBot.MODE, credenciales: xBot.HAS_CREDS, previews });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- Auto-translate endpoint (manual trigger) ---

app.post('/webhook/translate', async (req, res) => {
  if (!AUTO_TRANSLATE_ENABLED) {
    return res.status(503).json({ error: 'Auto-translate not configured (missing ANTHROPIC_API_KEY)' });
  }

  const postId = req.body?.post_id || req.body?.post?.current?.id;
  if (!postId) {
    return res.status(400).json({ error: 'Missing post_id' });
  }

  // Respond immediately
  res.status(200).json({ received: true, post_id: postId, force: req.body?.force === true });

  autoTranslatePost(postId, req.body?.force === true).catch(err => {
    console.error(`[translate] Manual trigger error: ${err.message}`);
  });
});

// --- Related posts endpoints ---

app.post('/webhook/related-posts', (req, res) => {
  // Respond immediately so Ghost doesn't timeout
  res.status(200).json({ received: true });
  console.log('[related] Webhook received, scheduling recompute (10s debounce)...');
  scheduleRelatedRecompute();
});

app.get('/api/related-posts.json', (req, res) => {
  res.set('Access-Control-Allow-Origin', 'https://www.421.news');
  res.set('Cache-Control', 'public, max-age=60');
  if (!relatedPostsReady) {
    res.status(503).json({ error: 'not ready yet' });
    return;
  }
  res.json(relatedPostsJSON);
});

// Focal points JSON (base + overlay). Theme fetches this first, falls back to asset.
app.get('/api/feature-focal.json', (req, res) => {
  res.set('Access-Control-Allow-Origin', 'https://www.421.news');
  res.set('Cache-Control', 'public, max-age=60');
  if (!focalReady) { res.status(503).json({ error: 'not ready yet' }); return; }
  res.json(focalMap);
});
app.options('/api/feature-focal.json', (req, res) => {
  res.set('Access-Control-Allow-Origin', 'https://www.421.news');
  res.set('Access-Control-Allow-Methods', 'GET');
  res.status(204).end();
});

// CORS preflight for the JSON endpoint
app.options('/api/related-posts.json', (req, res) => {
  res.set('Access-Control-Allow-Origin', 'https://www.421.news');
  res.set('Access-Control-Allow-Methods', 'GET');
  res.set('Access-Control-Allow-Headers', 'Content-Type');
  res.status(204).end();
});

// --- Comment delete proxy (Admin API required) ---
app.options('/api/comments/delete', (req, res) => {
  res.set('Access-Control-Allow-Origin', 'https://www.421.news');
  res.set('Access-Control-Allow-Methods', 'POST');
  res.set('Access-Control-Allow-Headers', 'Content-Type');
  res.status(204).end();
});

app.post('/api/comments/delete', async (req, res) => {
  res.set('Access-Control-Allow-Origin', 'https://www.421.news');
  const { comment_id, member_uuid } = req.body || {};
  if (!comment_id || !member_uuid) {
    return res.status(400).json({ error: 'Missing comment_id or member_uuid' });
  }
  try {
    // Fetch comment via Admin API to verify ownership
    const comment = await ghostRequest('GET', `/ghost/api/admin/comments/${comment_id}/`);
    const commentMember = comment.comments && comment.comments[0] && comment.comments[0].member;
    if (!commentMember || commentMember.uuid !== member_uuid) {
      return res.status(403).json({ error: 'Not your comment' });
    }
    // Delete via Admin API
    await ghostRequest('PUT', `/ghost/api/admin/comments/${comment_id}/`, {
      comments: [{ id: comment_id, status: 'deleted' }]
    });
    res.json({ success: true });
  } catch (err) {
    console.error('[comments] Delete error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// --- Hreflang cron: check recent posts every 30 min ---

async function hreflangCron() {
  console.log('[hreflang-cron] Checking recent posts for missing hreflang...');
  try {
    // Fetch last 10 posts (covers ~5 days of daily ES+EN pairs)
    const data = await contentAPIGet(
      `/ghost/api/content/posts/?key=${GHOST_CONTENT_KEY}` +
      `&limit=10&order=published_at%20desc` +
      `&include=tags&fields=id,slug,title,published_at,codeinjection_head`
    );
    const posts = data.posts || [];
    let processed = 0;

    // Se corre siempre: handleWebhook es idempotente (no escribe si el bloque ya
    // es el correcto), así que no hace falta adivinar acá qué post está incompleto.
    // El chequeo previo miraba solo el par ES<->EN y por eso nunca detectaba que a
    // una nota le faltaran las traducciones intl en el set.
    for (const post of posts) {
      const result = await handleWebhook({
        post: { current: { id: post.id, slug: post.slug, title: post.title, published_at: post.published_at, tags: post.tags } }
      });

      if (result.status === 'synced' && result.escritos > 0) {
        processed++;
        console.log(`[hreflang-cron] Sincronizado ${post.slug}: ${result.langs.join(',')} (${result.escritos} escritos)`);
      } else if (result.status === 'conflict') {
        console.error(`[hreflang-cron] Conflicto sin resolver en ${post.slug}`);
      }
    }

    console.log(`[hreflang-cron] Done: ${processed} posts updated`);
  } catch (err) {
    console.error(`[hreflang-cron] Error: ${err.message}`);
  }
}

setInterval(hreflangCron, 30 * 60 * 1000); // every 30 minutes

// --- Curaduría cron: barrido completo una vez por día ---
//
// El webhook ya sincroniza el cluster cuando se publica o se edita una nota, así
// que el caso normal está cubierto. Esto es la red de seguridad para el caso que
// el webhook NO ve bien: re-curar una nota vieja (sacarle #canon a algo de 2024)
// dispara un edit, pero si Render estaba reiniciando o Ghost no reintentó, la
// divergencia queda muda y solo se nota mirando /en/routes/ contra /es/rutas/.
// Un barrido diario es barato (~18 requests) y cierra el agujero.

const CURADURIA_ENABLED = process.env.CURADURIA_SYNC !== 'off';

async function curaduriaCron() {
  if (!CURADURIA_ENABLED) return;
  try {
    await curaduria.sweep({ ghostRequest });
  } catch (err) {
    console.error(`[curaduria] cron: ${err.message}`);
  }
}

setInterval(curaduriaCron, 24 * 60 * 60 * 1000);
setTimeout(curaduriaCron, 5 * 60 * 1000); // al arrancar, pasados los 5 min de warmup

// Auditoría a demanda: dice qué está fuera de sincro sin tocar nada.
app.get('/api/curaduria/audit', async (req, res) => {
  try {
    res.json(await curaduria.sweep({ ghostRequest, dry: true }));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Sincronización a demanda. Escribe: mismo patrón de auth que /api/emails/run.
app.post('/api/curaduria/sync', async (req, res) => {
  if (!process.env.EMAILS_RUN_KEY || req.headers['x-webhook-key'] !== process.env.EMAILS_RUN_KEY) {
    return res.status(401).json({ error: 'unauthorized' });
  }
  try {
    res.json(await curaduria.sweep({ ghostRequest }));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- Auditoría de hreflang: la red de seguridad ---
// El apareo es heurístico y puede errar sin que nadie se entere: un link que lleva al
// artículo equivocado se ve igual de bien que uno correcto. Esto lo detecta solo.
//
// Tres categorías, y solo dos son problemas:
//   ROTO    → el par apunta a un slug que no está publicado. Da 404.
//   CRUZADO → los dos tienen meta y se contradicen. Lleva al artículo equivocado.
//   SIN VUELTA → el par no tiene meta de regreso. La ida funciona; Google prefiere
//                bidireccional pero no rompe nada. No se reporta como error.
// Se ignoran los hermanos numerados (post-2, post-3...): son las traducciones intl, que
// heredan el meta del original y no pueden todas recibir el apunte de vuelta.
async function auditarHreflang() {
  const parDe = (head) => {
    const m = (head || '').match(/name="(?:english|spanish)-version" content="([^"]+)"/);
    return m ? m[1] : null;
  };
  const base = (s) => String(s).replace(/-\d+$/, '');

  // Ojo: `fields` y `include` se pisan en la API de Ghost — pidiendo fields se pierden los
  // tags. Se traen enteros y se filtra acá.
  let todos = [], page = 1, total = 1;
  while (todos.length < total) {
    const d = await ghostRequest('GET', `/ghost/api/admin/posts/?limit=100&page=${page}&include=tags&filter=status:published`);
    total = d.meta.pagination.total;
    todos = todos.concat(d.posts);
    page++;
    if (page > 30) break;
  }
  const idiomaDe = (p) => {
    const t = (p.tags || []).map(x => x.slug).find(s => /^hash-(es|en|pt|fr|zh|ja|ko|tr)$/.test(s));
    return t ? t.replace('hash-', '') : 'es';
  };
  const publicados = new Map(todos.map(p => [p.slug, p]));
  const rotos = [], cruzados = [], idiomaMal = [];
  todos.forEach(p => {
    const head = p.codeinjection_head;
    const destino = parDe(head);
    if (!destino) return;
    if (!publicados.has(destino)) { rotos.push([p.slug, destino]); return; }

    // El destino tiene que estar en el OTRO idioma del par. Sin este chequeo se cuelan
    // los casos en que un post EN declara como versión española una traducción al francés
    // o al turco: comparten el slug base (mcluhan-ia-llm vs mcluhan-ia-llm-7) así que la
    // normalización numérica de más abajo los daba por buenos. Pasó con 3 posts.
    const esperado = /english-version/.test(head || '') ? 'en' : 'es';
    const real = idiomaDe(publicados.get(destino));
    if (real !== esperado) { idiomaMal.push([p.slug, destino, `es ${real}, se esperaba ${esperado}`]); return; }

    const vuelta = parDe(publicados.get(destino).codeinjection_head);
    if (vuelta && base(vuelta) !== base(p.slug)) cruzados.push([p.slug, destino, vuelta]);
  });

  if (rotos.length || cruzados.length || idiomaMal.length) {
    console.error(`[hreflang-audit] ${rotos.length} ROTOS · ${cruzados.length} CRUZADOS · ${idiomaMal.length} IDIOMA MAL, sobre ${todos.length} publicados`);
    rotos.forEach(([a, b]) => console.error(`  ROTO       ${a} → ${b} (no publicado)`));
    cruzados.forEach(([a, b, c]) => console.error(`  CRUZADO    ${a} → ${b}, pero ese apunta a ${c}`));
    idiomaMal.forEach(([a, b, m]) => console.error(`  IDIOMA MAL ${a} → ${b} (${m})`));
  } else {
    console.log(`[hreflang-audit] OK — ${todos.length} publicados, sin pares rotos, cruzados ni con idioma equivocado`);
  }
  return { revisados: todos.length, rotos, cruzados, idiomaMal };
}

// Diario. El apareo falla al publicar en tanda, así que conviene enterarse al día
// siguiente y no cuando un lector reporta el 404 tres semanas después.
setInterval(() => {
  auditarHreflang().catch(err => console.error(`[hreflang-audit] Error: ${err.message}`));
}, 24 * 60 * 60 * 1000);
setTimeout(() => {
  auditarHreflang().catch(err => console.error(`[hreflang-audit] Error: ${err.message}`));
}, 90 * 1000);

// A demanda, para no esperar al cron. Público: solo devuelve slugs ya públicos.
app.get('/api/hreflang/audit', async (req, res) => {
  try {
    res.json(await auditarHreflang());
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// =============================================================================
// GA4 ANALYTICS DATA (queries GA4 Data API, serves /api/ga4-data.json)
// =============================================================================

const GA4_PROPERTY_ID = '459246312';
// Support both: individual env vars (preferred) or full JSON blob
const GA4_CLIENT_ID = (process.env.GA4_CLIENT_ID || '').trim();
const GA4_CLIENT_SECRET = (process.env.GA4_CLIENT_SECRET || '').trim();
const GA4_REFRESH_TOKEN = (process.env.GA4_REFRESH_TOKEN || '').trim();
const GA4_SERVICE_ACCOUNT_JSON = process.env.GA4_SERVICE_ACCOUNT_JSON;
const GA4_ENABLED = !!(GA4_CLIENT_ID || GA4_SERVICE_ACCOUNT_JSON);

let ga4Data = null;
let ga4LastUpdate = null;
let ga4LastError = null;

// --- GA4 auth: OAuth refresh token → access token (raw HTTP, no library dependency) ---

function getGA4AccessToken() {
  return new Promise((resolve, reject) => {
    if (!GA4_CLIENT_ID || !GA4_CLIENT_SECRET || !GA4_REFRESH_TOKEN) {
      return reject(new Error('GA4 credentials not configured (set GA4_CLIENT_ID + GA4_CLIENT_SECRET + GA4_REFRESH_TOKEN)'));
    }

    const postData = [
      'grant_type=refresh_token',
      'client_id=' + encodeURIComponent(GA4_CLIENT_ID),
      'client_secret=' + encodeURIComponent(GA4_CLIENT_SECRET),
      'refresh_token=' + encodeURIComponent(GA4_REFRESH_TOKEN)
    ].join('&');

    const req = https.request({
      hostname: 'oauth2.googleapis.com',
      path: '/token',
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(postData)
      }
    }, (res) => {
      let data = '';
      res.on('data', (c) => { data += c; });
      res.on('end', () => {
        try {
          const body = JSON.parse(data);
          if (res.statusCode === 200 && body.access_token) {
            resolve(body.access_token);
          } else {
            reject(new Error('Token refresh failed: ' + JSON.stringify(body)));
          }
        } catch (e) {
          reject(new Error('Token response parse error: ' + data.slice(0, 200)));
        }
      });
    });
    req.on('error', reject);
    req.write(postData);
    req.end();
  });
}

// --- GA4 Data API query ---

function ga4RunReport(accessToken, body) {
  return new Promise((resolve, reject) => {
    const postData = JSON.stringify(body);
    const req = https.request({
      hostname: 'analyticsdata.googleapis.com',
      path: `/v1beta/properties/${GA4_PROPERTY_ID}:runReport`,
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData)
      }
    }, (res) => {
      let data = '';
      res.on('data', (c) => { data += c; });
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve(JSON.parse(data));
        } else {
          reject(new Error(`GA4 API ${res.statusCode}: ${data.slice(0, 500)}`));
        }
      });
    });
    req.on('error', reject);
    req.write(postData);
    req.end();
  });
}

// --- GA4 data processing ---

const GA4_EDITORIAL_SLUGS = new Set([
  'suscribite', 'subscribe', 'rutas', 'routes', 'canon', 'revista-421',
  'pitcheale-a-421', 'mi-suscripcion', 'my-subscription', 'ultimos-posts',
  'last-posts', 'analytics', 'gracias', 'oh-yes'
]);

// Páginas editoriales migradas de path raíz (/suscribite/) a path con prefijo de
// idioma (/es/suscribite/). Mapeo viejo→canónico para unificar las views pre y
// post migración en una sola fila del dashboard. gracias/oh-yes quedan a nivel raíz
// (sin prefijo de idioma), por eso se omiten a propósito.
const GA4_EDITORIAL_CANONICAL = {
  'suscribite': '/es/suscribite/', 'rutas': '/es/rutas/', 'canon': '/es/canon/',
  'revista-421': '/es/revista-421/', 'pitcheale-a-421': '/es/pitcheale-a-421/',
  'mi-suscripcion': '/es/mi-suscripcion/', 'ultimos-posts': '/es/ultimos-posts/',
  'analytics': '/es/analytics/',
  'subscribe': '/en/subscribe/', 'routes': '/en/routes/',
  'my-subscription': '/en/my-subscription/', 'last-posts': '/en/last-posts/'
};

const GA4_HARD_MERGES = {};
function addGA4Merge(paths, targetSlug, title, en) {
  for (const p of paths) GA4_HARD_MERGES[p] = { targetSlug, title, en };
}
addGA4Merge([
  '/es/nick-land-aceleracionismo-parte-1/', '/es/nick-land-aceleracionismo/',
  '/nick-land-aceleracionismo-parte-1/', '/nick-land-aceleracionismo-parte-2/',
  '/nick-land-aceleracionismo/', '/nick-land-aceleracionismo-parte-1/3/',
  '/nick-land-aceleracionismo-parte-1/null/'
], 'nick-land-aceleracionismo', 'Nick Land y el aceleracionismo (completo)', false);
addGA4Merge([
  '/en/nick-land-the-apostle-of-chaos/', '/en/nick-land-the-apostle-of-chaos-part-2/'
], 'nick-land-the-apostle-of-chaos', 'Nick Land: The Apostle of Chaos (complete)', true);
addGA4Merge([
  '/es/la-historia-de-ricardo-fort/', '/es/la-historia-de-ricardo-fort-parte-uno/',
  '/la-historia-de-ricardo-fort/', '/la-historia-de-ricardo-fort-parte-dos/',
  '/la-historia-de-ricardo-fort-parte-uno/', '/la-historia-de-ricardo-fort-parte-uno/3/'
], 'la-historia-de-ricardo-fort', 'La historia de Ricardo Fort (completo)', false);
addGA4Merge([
  '/en/ricardo-fort-the-real-super-chad/', '/en/ricardo-fort-the-real-super-chad-part-1/',
  '/en/ricardo-fort-the-real-super-chad-part-2/', '/en/ricardo-fort-the-real-super-chad-part-2'
], 'ricardo-fort-the-real-super-chad', 'Ricardo Fort: The Real Super Chad (complete)', true);

const GA4_CHANNEL_COLORS = {
  'Organic Social': '#fcd221', 'Direct': '#17a583', 'Organic Search': '#e07c24',
  'Referral': '#c0392b', 'Organic Video': '#6c5ce7', 'Unassigned': '#636e72',
  'Email': '#00b894', 'Organic Shopping': '#fdcb6e'
};

// Conversion-related events kept in the analytics payload (whitelist keeps the JSON lean).
const GA4_CONVERSION_EVENTS = [
  'popup_cta_click', 'sticky_subscribe_click', 'nav_subscribe_click', 'post_subscribe_click',
  'revista_wizard_cta_click', 'sign_up_intent', 'begin_checkout', 'payment_method_selected',
  'purchase_initiated', 'sign_up', 'popup_shown', 'popup_dismissed'
];

const GA4_MONTH_LABELS = {
  '202409': 'Sep 2024', '202410': 'Oct 2024', '202411': 'Nov 2024', '202412': 'Dic 2024',
  '202501': 'Ene 2025', '202502': 'Feb 2025', '202503': 'Mar 2025', '202504': 'Abr 2025',
  '202505': 'May 2025', '202506': 'Jun 2025', '202507': 'Jul 2025', '202508': 'Ago 2025',
  '202509': 'Sep 2025', '202510': 'Oct 2025', '202511': 'Nov 2025', '202512': 'Dic 2025',
  '202601': 'Ene 2026', '202602': 'Feb 2026', '202603': 'Mar 2026', '202604': 'Abr 2026',
  '202605': 'May 2026', '202606': 'Jun 2026', '202607': 'Jul 2026', '202608': 'Ago 2026',
  '202609': 'Sep 2026', '202610': 'Oct 2026', '202611': 'Nov 2026', '202612': 'Dic 2026'
};

function isGA4Article(path) { return /^\/(?:es|en)\/[^\/]+\/$/.test(path); }
function isGA4OldRoot(path) {
  if (/^\/(es|en|ghost|assets|content|members|public|rss|sitemap|robots|favicon|author|tag)\//i.test(path)) return false;
  if (path === '/') return false;
  if (!/^\/[^\/]+\/$/.test(path)) return false;
  const slug = path.replace(/^\//, '').replace(/\/$/, '');
  return !GA4_EDITORIAL_SLUGS.has(slug);
}
function ga4Slug(path) { const m = path.match(/^\/(?:es|en)\/([^\/]+)\/$/); return m ? m[1] : null; }
function ga4OldSlug(path) { const m = path.match(/^\/([^\/]+)\/$/); return m ? m[1] : null; }

function classifyGA4Page(path) {
  if (path === '/' || path === '/es/' || path === '/en/') return { type: 'home', title: path === '/en/' ? 'Home (EN)' : path === '/es/' ? 'Home (ES)' : 'Landing' };
  if (/^\/(?:es|en)\/tag\//.test(path)) return { type: 'tag', title: path.replace(/^\/(?:es|en)\/tag\//, '').replace(/\/$/, '') };
  if (/^\/author\//.test(path)) return { type: 'author', title: path.replace(/^\/author\//, '').replace(/\/$/, '') };
  if (/^\/tag\//.test(path)) return { type: 'tag', title: path.replace(/^\/tag\//, '').replace(/\/$/, '') };
  return { type: 'other', title: path };
}

function processGA4Results(pageRows, channelRows, monthlyRows, dailyRows, eventRows, deviceRows, geoRows) {
  // 1. Build path data
  const pathData = {};
  for (const row of pageRows) {
    const path = row.dimensionValues[0].value;
    const ym = row.dimensionValues[1].value;
    const pv = parseInt(row.metricValues[0].value);
    const u = parseInt(row.metricValues[1].value);
    const d = Math.round(parseFloat(row.metricValues[2].value));
    if (!pathData[path]) pathData[path] = {};
    pathData[path][ym] = { pv, u, d };
  }

  const articleMap = {};
  const pageMap = {};

  // Acumula meses de una página editorial en su entrada canónica (mergeando
  // path viejo /suscribite/ con /es/suscribite/ en una sola fila).
  function mergeEditorialPage(canonPath, slug, en, months) {
    if (!pageMap[canonPath]) pageMap[canonPath] = { path: canonPath, title: slug, type: 'editorial', en, m: {} };
    for (const [ym, data] of Object.entries(months)) {
      if (!pageMap[canonPath].m[ym]) pageMap[canonPath].m[ym] = { pv: 0, u: 0, d: 0 };
      pageMap[canonPath].m[ym].pv += data.pv;
      pageMap[canonPath].m[ym].u += data.u;
      if (data.d > pageMap[canonPath].m[ym].d) pageMap[canonPath].m[ym].d = data.d;
    }
  }

  for (const [path, months] of Object.entries(pathData)) {
    // Hard merges
    if (GA4_HARD_MERGES[path]) {
      const hm = GA4_HARD_MERGES[path];
      const ts = hm.targetSlug;
      if (!articleMap[ts]) articleMap[ts] = { slug: ts, title: hm.title, en: hm.en, mergeNotes: [], m: {} };
      for (const [ym, data] of Object.entries(months)) {
        if (!articleMap[ts].m[ym]) articleMap[ts].m[ym] = { pv: 0, u: 0, d: 0 };
        articleMap[ts].m[ym].pv += data.pv;
        articleMap[ts].m[ym].u += data.u;
        if (data.d > articleMap[ts].m[ym].d) articleMap[ts].m[ym].d = data.d;
      }
      articleMap[ts].mergeNotes.push(path);
      continue;
    }

    // Article: /es/{slug}/ or /en/{slug}/
    if (isGA4Article(path)) {
      const slug = ga4Slug(path);
      if (GA4_EDITORIAL_SLUGS.has(slug)) {
        // Página editorial: acumular (mergea con su path raíz viejo si existe).
        mergeEditorialPage(path, slug, path.startsWith('/en/'), months);
        continue;
      }
      const en = path.startsWith('/en/');
      if (!articleMap[slug]) articleMap[slug] = { slug, title: '', en, mergeNotes: [], m: {} };
      for (const [ym, data] of Object.entries(months)) {
        if (!articleMap[slug].m[ym]) articleMap[slug].m[ym] = { pv: 0, u: 0, d: 0 };
        articleMap[slug].m[ym].pv += data.pv;
        articleMap[slug].m[ym].u += data.u;
        articleMap[slug].m[ym].d = data.d;
      }
      continue;
    }

    // Old root editorial page: /suscribite/, /rutas/, ... → mergear en su path
    // canónico /es|en/{slug}/ para que el dashboard muestre una sola fila.
    const editSlug = ga4OldSlug(path);
    if (editSlug && GA4_EDITORIAL_CANONICAL[editSlug]) {
      const canon = GA4_EDITORIAL_CANONICAL[editSlug];
      mergeEditorialPage(canon, editSlug, canon.startsWith('/en/'), months);
      continue;
    }

    // Old root article: /{slug}/ → merge with /es/{slug}/
    if (isGA4OldRoot(path)) {
      const slug = ga4OldSlug(path);
      if (!articleMap[slug]) articleMap[slug] = { slug, title: '', en: false, mergeNotes: [], m: {} };
      for (const [ym, data] of Object.entries(months)) {
        if (!articleMap[slug].m[ym]) articleMap[slug].m[ym] = { pv: 0, u: 0, d: 0 };
        articleMap[slug].m[ym].pv += data.pv;
        articleMap[slug].m[ym].u += data.u;
        if (data.d > articleMap[slug].m[ym].d) articleMap[slug].m[ym].d = data.d;
      }
      articleMap[slug].mergeNotes.push(path);
      continue;
    }

    // Page
    const totalPV = Object.values(months).reduce((s, m) => s + m.pv, 0);
    if (totalPV < 50) continue;
    if (/^\/(ghost|assets|content|members|public|rss|sitemap|robots|favicon|posts)/.test(path)) continue;

    let effectivePath = path;
    const tagMatch = path.match(/^\/tag\/(.+)$/);
    if (tagMatch) effectivePath = '/es/tag/' + tagMatch[1];

    const cls = classifyGA4Page(effectivePath);
    const en = effectivePath.startsWith('/en/');
    if (!pageMap[effectivePath]) pageMap[effectivePath] = { path: effectivePath, title: cls.title, type: cls.type, en, m: {} };
    for (const [ym, data] of Object.entries(months)) {
      if (!pageMap[effectivePath].m[ym]) pageMap[effectivePath].m[ym] = { pv: 0, u: 0, d: 0 };
      pageMap[effectivePath].m[ym].pv += data.pv;
      pageMap[effectivePath].m[ym].u += data.u;
      if (data.d > pageMap[effectivePath].m[ym].d) pageMap[effectivePath].m[ym].d = data.d;
    }
  }

  // Sort articles by total PV, keep all with >= 1000 PV
  const articles = Object.values(articleMap).map(a => {
    let totalPV = 0;
    for (const m of Object.values(a.m)) totalPV += m.pv;
    return { ...a, totalPV };
  }).filter(a => a.totalPV >= 1000).sort((a, b) => b.totalPV - a.totalPV).map(a => {
    const obj = { slug: a.slug, title: a.title || a.slug.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase()), en: a.en };
    if (a.mergeNotes.length > 0) obj.merge = a.mergeNotes.join(' + ');
    obj.m = a.m;
    return obj;
  });

  // Sort pages by total PV, take top 100
  const pages = Object.values(pageMap).map(p => {
    let totalPV = 0;
    for (const m of Object.values(p.m)) totalPV += m.pv;
    return { ...p, totalPV };
  }).sort((a, b) => b.totalPV - a.totalPV).slice(0, 100).map(p => ({
    path: p.path, title: p.title, type: p.type, en: p.en, m: p.m
  }));

  // Channels with monthly data
  const channelMap = {};
  for (const row of channelRows) {
    const ch = row.dimensionValues[0].value;
    const ym = row.dimensionValues[1].value;
    const s = parseInt(row.metricValues[0].value);
    const u = parseInt(row.metricValues[1].value);
    if (!channelMap[ch]) channelMap[ch] = { name: ch, color: GA4_CHANNEL_COLORS[ch] || '#999', m: {} };
    channelMap[ch].m[ym] = { s, u };
  }
  const channels = Object.values(channelMap).sort((a, b) => {
    const aT = Object.values(a.m).reduce((s, m) => s + m.s, 0);
    const bT = Object.values(b.m).reduce((s, m) => s + m.s, 0);
    return bT - aT;
  });

  // Monthly
  const monthly = monthlyRows.map(row => {
    const ym = row.dimensionValues[0].value;
    return {
      month: ym,
      label: GA4_MONTH_LABELS[ym] || ym,
      pv: parseInt(row.metricValues[0].value),
      s: parseInt(row.metricValues[1].value),
      u: parseInt(row.metricValues[2].value),
      d: Math.round(parseFloat(row.metricValues[3].value)),
      b: parseFloat(parseFloat(row.metricValues[4].value).toFixed(3))
    };
  }).sort((a, b) => a.month.localeCompare(b.month));

  // Daily (site-wide totals, date = 'YYYYMMDD'). Same shape as monthly rows
  // (pv/s/u/d/b) so the dashboard can reuse its rendering logic.
  const daily = (dailyRows || []).map(row => ({
    date: row.dimensionValues[0].value,
    pv: parseInt(row.metricValues[0].value),
    s: parseInt(row.metricValues[1].value),
    u: parseInt(row.metricValues[2].value),
    d: Math.round(parseFloat(row.metricValues[3].value)),
    b: parseFloat(parseFloat(row.metricValues[4].value).toFixed(3))
  })).sort((a, b) => a.date.localeCompare(b.date));

  // Conversion events: { name, m: { ym: { c } } }
  const eventMap = {};
  for (const row of (eventRows || [])) {
    const name = row.dimensionValues[0].value;
    const ym = row.dimensionValues[1].value;
    if (!eventMap[name]) eventMap[name] = { name, m: {} };
    eventMap[name].m[ym] = { c: parseInt(row.metricValues[0].value) };
  }
  const events = Object.values(eventMap);

  // Devices & geo share the channel shape: { name, m: { ym: { s, u } } }
  const totalSessions = (o) => Object.values(o.m).reduce((sum, m) => sum + m.s, 0);
  function buildSessionMap(rows) {
    const map = {};
    for (const row of (rows || [])) {
      const name = row.dimensionValues[0].value;
      const ym = row.dimensionValues[1].value;
      if (!map[name]) map[name] = { name, m: {} };
      map[name].m[ym] = { s: parseInt(row.metricValues[0].value), u: parseInt(row.metricValues[1].value) };
    }
    return map;
  }
  const devices = Object.values(buildSessionMap(deviceRows)).sort((a, b) => totalSessions(b) - totalSessions(a));
  const geo = Object.values(buildSessionMap(geoRows)).sort((a, b) => totalSessions(b) - totalSessions(a)).slice(0, 30);

  const today = new Date();
  const generated = today.toISOString().split('T')[0];

  return {
    team: [], // filled by getTeamHashes() in refreshGA4Data
    generated,
    range: { start: '2024-09-18', end: generated },
    monthly, daily, articles, pages, channels, events, devices, geo
  };
}

// --- Team hashes for /analytics access ---
// Safety fallback so a Ghost API failure never locks out the current team.
// Son jfruocco@gmail.com, agustinasojit@gmail.com y juanvon@421.news (verificado
// 2026-08-24). Mantener: si la consulta a Ghost falla, son los unicos que entran.
const FALLBACK_TEAM_HASHES = [
  '00285f8378c256764d05b03690b04ab876110c230a199a060064c33bfc734d24',
  '708e778156d49e0e207733e8f57251fbff7189c94bccbd175afafd04608c06e7',
  'f3ea8d6eaa950fbe0ea7017430ed3118dd69a43bc45ffbfa107a672244c79f46'
];

function sha256Hex(str) {
  return crypto.createHash('sha256').update(str.toLowerCase().trim()).digest('hex');
}

async function getTeamHashes() {
  const hashes = new Set(FALLBACK_TEAM_HASHES);
  try {
    let page = 1;
    let pages = 1;
    do {
      const res = await ghostRequest('GET', `/ghost/api/admin/members/?filter=${encodeURIComponent('label:equipo')}&limit=100&page=${page}`);
      for (const m of (res.members || [])) {
        if (m.email) hashes.add(sha256Hex(m.email));
      }
      pages = (res.meta && res.meta.pagination && res.meta.pagination.pages) || 1;
      page++;
    } while (page <= pages);
    console.log(`[ga4] Team hashes resolved: ${hashes.size} (fallback=${FALLBACK_TEAM_HASHES.length} + Ghost label "equipo")`);
  } catch (err) {
    console.log(`[ga4] getTeamHashes failed, using fallback only: ${err.message}`);
  }
  return [...hashes];
}

// --- Ghost member token verification (gates sensitive endpoints, e.g. revenue) ---
// A logged-in Ghost member can mint a signed identity JWT at /members/api/session.
// We verify its RS256 signature against the site's public JWKS, so the identity
// cannot be forged: only a real logged-in member's browser can produce a valid token.
const GHOST_JWKS_URL = 'https://www.421.news/members/.well-known/jwks.json';
let _jwksCache = { pems: {}, ts: 0 };

function fetchJwks() {
  return new Promise((resolve, reject) => {
    https.get(GHOST_JWKS_URL, (res) => {
      let b = '';
      res.on('data', (c) => { b += c; });
      res.on('end', () => { try { resolve(JSON.parse(b)); } catch (e) { reject(e); } });
    }).on('error', reject);
  });
}

async function getSigningPem(kid) {
  const fresh = (Date.now() - _jwksCache.ts) < 3600 * 1000;
  if (fresh && _jwksCache.pems[kid]) return _jwksCache.pems[kid];
  const jwks = await fetchJwks();
  const pems = {};
  for (const k of (jwks.keys || [])) {
    pems[k.kid] = crypto.createPublicKey({ key: k, format: 'jwk' }).export({ type: 'spki', format: 'pem' });
  }
  _jwksCache = { pems, ts: Date.now() };
  return pems[kid];
}

// Verify Bearer member token → return decoded claims (signature proven), or null.
async function verifyMemberToken(req) {
  const auth = req.get('authorization') || '';
  const m = auth.match(/^Bearer\s+(.+)$/i);
  if (!m) return null;
  const token = m[1].trim();
  let header;
  try { header = JSON.parse(Buffer.from(token.split('.')[0], 'base64').toString()); }
  catch (e) { return null; }
  if (!header || !header.kid) return null;
  try {
    const pem = await getSigningPem(header.kid);
    if (!pem) return null;
    // Ghost signs member identity tokens with RS512. Allow RS256 too (both use the
    // RSA public key; no symmetric algs, so no key-confusion risk).
    return jwt.verify(token, pem, { algorithms: ['RS512', 'RS256'] }) || null;
  } catch (e) {
    return null;
  }
}

// Pull the member email out of verified claims regardless of which claim carries it
// (Ghost uses `sub`, but we scan defensively so a claim-shape change never locks out
// the team). Falls back to resolving a uuid-shaped identifier via the Admin API.
async function emailFromClaims(claims) {
  if (!claims) return null;
  if (typeof claims.sub === 'string' && claims.sub.includes('@')) return claims.sub;
  for (const v of Object.values(claims)) {
    if (typeof v === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) return v;
  }
  const uuid = [claims.sub, claims.uuid, claims.id].find(v => typeof v === 'string' && /^[0-9a-f-]{20,}$/i.test(v));
  if (uuid) {
    try {
      const r = await ghostRequest('GET', `/ghost/api/admin/members/?filter=${encodeURIComponent(`uuid:'${uuid}'`)}&limit=1`);
      return (r.members && r.members[0] && r.members[0].email) || null;
    } catch (e) { return null; }
  }
  return null;
}

// Un mail sin exponerlo entero en los logs: j***@gmail.com.
function mailEnmascarado(email) {
  return String(email).replace(/^(.)[^@]*(@.*)$/, '$1***$2');
}

/**
 * ¿Este miembro verificado es del equipo?
 *
 * El set es fallback hashes ∪ label "equipo" de Ghost. Se mira primero la copia
 * cacheada en ga4Data.team, que se rearma en cada refresh de GA4 (2 veces por día).
 *
 * ⚠️ Ante un MISS se re-consulta Ghost en vivo antes de negar. Sin eso, alguien
 * que acaba de recibir el label queda afuera hasta el próximo refresh —hasta 12
 * horas— y el síntoma es idéntico al de un bug de permisos: "le puse el tag y no
 * entra". El costo es una consulta a Ghost por acceso denegado, nada.
 */
async function resolverAccesoEquipo(claims) {
  const email = await emailFromClaims(claims);
  if (!email) return { ok: false, motivo: `claims sin email (${Object.keys(claims || {}).join(',')})` };

  const hash = sha256Hex(email);
  const cache = (ga4Data && Array.isArray(ga4Data.team) && ga4Data.team.length) ? ga4Data.team : null;
  if (cache && cache.includes(hash)) return { ok: true, email };

  const fresco = await getTeamHashes();
  if (ga4Data) ga4Data.team = fresco;
  if (fresco.includes(hash)) return { ok: true, email, via: 'refresco' };

  return { ok: false, email, motivo: `no tiene el label "equipo" (${fresco.length} en el equipo)` };
}

async function isTeamMember(claims) {
  return (await resolverAccesoEquipo(claims)).ok;
}

// Express gate for team-only endpoints.
//
// Loguea SIEMPRE el motivo del rechazo. Un 403 mudo era indistinguible entre "no
// está logueado", "el token no verifica" y "no está en el equipo", y las tres se
// arreglan de manera distinta.
async function requireTeam(req, res, next) {
  res.set('Access-Control-Allow-Origin', 'https://www.421.news');
  res.set('Vary', 'Origin');
  const ruta = req.path;
  try {
    const claims = await verifyMemberToken(req);
    if (!claims) {
      const auth = req.get('authorization') || '';
      console.log(`[team] 403 en ${ruta}: ${auth ? 'token invalido o vencido' : 'sin header Authorization (miembro no logueado)'}`);
      res.status(403).json({ error: 'forbidden' });
      return;
    }
    const r = await resolverAccesoEquipo(claims);
    if (!r.ok) {
      console.log(`[team] 403 en ${ruta}: ${r.email ? mailEnmascarado(r.email) + ' ' : ''}${r.motivo}`);
      res.status(403).json({ error: 'forbidden' });
      return;
    }
    console.log(`[team] OK en ${ruta}: ${mailEnmascarado(r.email)}${r.via ? ' (' + r.via + ')' : ''}`);
  } catch (e) {
    console.log(`[team] 403 en ${ruta}: error inesperado — ${e.message}`);
    res.status(403).json({ error: 'forbidden' });
    return;
  }
  next();
}

function teamPreflight(req, res) {
  res.set('Access-Control-Allow-Origin', 'https://www.421.news');
  res.set('Access-Control-Allow-Methods', 'GET');
  res.set('Access-Control-Allow-Headers', 'Authorization, Content-Type');
  res.set('Vary', 'Origin');
  res.status(204).end();
}

// --- Revista 421: gate del número del mes ---
// verifyMemberToken/emailFromClaims/ghostRequest son function declarations (hoisted), así
// que ya están disponibles acá.
revistaGate.init({ ghostRequest, verifyMemberToken, emailFromClaims });

// Lo dispara Ghost (page.published.edited) cuando se guarda la página de la revista.
// Respondemos 200 al toque y trabajamos después: Ghost reintenta si tarda.
app.post('/webhook/revista', (req, res) => {
  res.json({ ok: true });
  revistaGate.syncPage('webhook').catch(err => console.error(`[revista-gate] webhook: ${err.message}`));
});

app.get('/api/revista/estado', revistaGate.estado);
app.options('/api/revista/descarga/:numero', revistaGate.preflight);
app.get('/api/revista/descarga/:numero', revistaGate.descargar);

// Red de seguridad: si el webhook falla o nunca llega, el PDF nuevo queda público y nadie
// se entera. Este chequeo lo vuelve a sacar. Mismo criterio que revisarColgados() en los
// emails automáticos: lo único que detecta un automatismo que no corrió es otro que sí.
setInterval(() => {
  revistaGate.syncPage('cron').catch(err => console.error(`[revista-gate] cron: ${err.message}`));
}, 30 * 60 * 1000);
setTimeout(() => {
  revistaGate.syncPage('boot').catch(err => console.error(`[revista-gate] boot: ${err.message}`));
}, 20 * 1000);

// --- Titles enrichment from existing data ---

async function enrichArticleTitles(data) {
  // Try to load existing titles from theme asset
  try {
    const existing = await new Promise((resolve, reject) => {
      https.get('https://www.421.news/assets/data/ga4-data.json', (res) => {
        let body = '';
        res.on('data', (c) => { body += c; });
        res.on('end', () => {
          if (res.statusCode === 200) resolve(JSON.parse(body));
          else reject(new Error(`HTTP ${res.statusCode}`));
        });
      }).on('error', reject);
    });
    const titleMap = {};
    for (const a of (existing.articles || [])) titleMap[a.slug] = a.title;
    for (const a of data.articles) {
      if ((!a.title || a.title === a.slug.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase())) && titleMap[a.slug]) {
        a.title = titleMap[a.slug];
      }
    }
  } catch (e) {
    console.log('[ga4] Could not load existing titles: ' + e.message);
  }
}

// --- Full GA4 refresh ---

async function refreshGA4Data() {
  console.log('[ga4] Starting data refresh...');
  const start = Date.now();

  const accessToken = await getGA4AccessToken();
  const endDate = new Date().toISOString().split('T')[0];

  // Run queries in parallel
  const [pageResult, channelResult, monthlyResult, dailyResult, eventResult, deviceResult, geoResult] = await Promise.all([
    ga4RunReport(accessToken, {
      dateRanges: [{ startDate: '2024-09-18', endDate }],
      dimensions: [{ name: 'pagePath' }, { name: 'yearMonth' }],
      metrics: [{ name: 'screenPageViews' }, { name: 'totalUsers' }, { name: 'averageSessionDuration' }],
      limit: 25000,
      orderBys: [{ metric: { metricName: 'screenPageViews' }, desc: true }]
    }),
    ga4RunReport(accessToken, {
      dateRanges: [{ startDate: '2024-09-18', endDate }],
      dimensions: [{ name: 'sessionDefaultChannelGroup' }, { name: 'yearMonth' }],
      metrics: [{ name: 'sessions' }, { name: 'totalUsers' }],
      orderBys: [{ metric: { metricName: 'sessions' }, desc: true }]
    }),
    ga4RunReport(accessToken, {
      dateRanges: [{ startDate: '2024-09-18', endDate }],
      dimensions: [{ name: 'yearMonth' }],
      metrics: [{ name: 'screenPageViews' }, { name: 'sessions' }, { name: 'totalUsers' }, { name: 'averageSessionDuration' }, { name: 'bounceRate' }],
      orderBys: [{ dimension: { dimensionName: 'yearMonth', orderType: 'ALPHANUMERIC' }, desc: false }]
    }),
    ga4RunReport(accessToken, {
      dateRanges: [{ startDate: '2024-09-18', endDate }],
      dimensions: [{ name: 'date' }],
      metrics: [{ name: 'screenPageViews' }, { name: 'sessions' }, { name: 'totalUsers' }, { name: 'averageSessionDuration' }, { name: 'bounceRate' }],
      orderBys: [{ dimension: { dimensionName: 'date', orderType: 'ALPHANUMERIC' }, desc: false }]
    }),
    ga4RunReport(accessToken, {
      dateRanges: [{ startDate: '2024-09-18', endDate }],
      dimensions: [{ name: 'eventName' }, { name: 'yearMonth' }],
      metrics: [{ name: 'eventCount' }],
      dimensionFilter: { filter: { fieldName: 'eventName', inListFilter: { values: GA4_CONVERSION_EVENTS } } },
      limit: 5000
    }),
    ga4RunReport(accessToken, {
      dateRanges: [{ startDate: '2024-09-18', endDate }],
      dimensions: [{ name: 'deviceCategory' }, { name: 'yearMonth' }],
      metrics: [{ name: 'sessions' }, { name: 'totalUsers' }]
    }),
    ga4RunReport(accessToken, {
      dateRanges: [{ startDate: '2024-09-18', endDate }],
      dimensions: [{ name: 'country' }, { name: 'yearMonth' }],
      metrics: [{ name: 'sessions' }, { name: 'totalUsers' }],
      limit: 5000,
      orderBys: [{ metric: { metricName: 'sessions' }, desc: true }]
    })
  ]);

  console.log(`[ga4] Queries done: pages=${pageResult.rowCount}, channels=${channelResult.rowCount}, monthly=${monthlyResult.rowCount}, daily=${dailyResult.rowCount}, events=${eventResult.rowCount}, devices=${deviceResult.rowCount}, geo=${geoResult.rowCount}`);

  ga4Data = processGA4Results(
    pageResult.rows || [],
    channelResult.rows || [],
    monthlyResult.rows || [],
    dailyResult.rows || [],
    eventResult.rows || [],
    deviceResult.rows || [],
    geoResult.rows || []
  );

  ga4Data.team = await getTeamHashes();

  await enrichArticleTitles(ga4Data);

  ga4LastUpdate = new Date().toISOString();
  const elapsed = ((Date.now() - start) / 1000).toFixed(1);
  console.log(`[ga4] Refresh complete in ${elapsed}s: ${ga4Data.articles.length} articles, ${ga4Data.pages.length} pages`);
}

// --- GA4 endpoint ---

app.get('/api/ga4-data.json', (req, res) => {
  // Public, aggregate analytics (powers homepage most-read + media kit + pricing).
  // '*' lets the media kit fetch it from any origin, incl. the standalone deck.
  // NOTE: `team` (SHA-256 access list) is stripped — it's used server-side only now
  // (see requireTeam); it must not travel in a world-readable payload.
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Cache-Control', 'public, max-age=300');
  if (!ga4Data) {
    res.status(503).json({ error: 'GA4 data not ready yet' });
    return;
  }
  const pub = Object.assign({}, ga4Data);
  delete pub.team;
  res.json(pub);
});

app.options('/api/ga4-data.json', (req, res) => {
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Methods', 'GET');
  res.set('Access-Control-Allow-Headers', 'Content-Type');
  res.status(204).end();
});

// --- GA4 status & manual refresh ---

app.get('/api/ga4-status', (req, res) => {
  try {
    let credType = 'not set';
    if (GA4_CLIENT_ID && GA4_CLIENT_SECRET && GA4_REFRESH_TOKEN) {
      credType = 'individual_env_vars';
    } else if (GA4_SERVICE_ACCOUNT_JSON) {
      try {
        const c = JSON.parse(GA4_SERVICE_ACCOUNT_JSON);
        credType = 'json_blob:' + (c.type || 'unknown');
      } catch (e) { credType = 'json_blob:parse_error'; }
    }

    res.json({
      hasCredentials: GA4_ENABLED,
      credentialType: credType,
      envLengths: { clientId: GA4_CLIENT_ID.length, clientSecret: GA4_CLIENT_SECRET.length, refreshToken: GA4_REFRESH_TOKEN.length },
      lastUpdate: ga4LastUpdate,
      lastError: ga4LastError,
      dataLoaded: !!ga4Data,
      articles: ga4Data && ga4Data.articles ? ga4Data.articles.length : 0,
      pages: ga4Data && ga4Data.pages ? ga4Data.pages.length : 0,
      channels: ga4Data && ga4Data.channels ? ga4Data.channels.length : 0,
      generated: ga4Data ? ga4Data.generated : null
    });
  } catch (e) {
    res.status(500).json({ error: e.message, stack: e.stack });
  }
});

app.post('/api/ga4-refresh', async (req, res) => {
  try {
    await refreshGA4Data();
    ga4LastError = null;
    res.json({ ok: true, articles: ga4Data.articles.length, pages: ga4Data.pages.length, generated: ga4Data.generated });
  } catch (err) {
    ga4LastError = err.message;
    res.status(500).json({ error: err.message });
  }
});

// --- GA4 cron: refresh twice daily at 12:00 and 00:00 ART (UTC-3) ---

function scheduleGA4Cron() {
  // Check every 15 min if it's time to refresh
  setInterval(() => {
    const now = new Date();
    // ART = UTC-3
    const artHour = (now.getUTCHours() - 3 + 24) % 24;
    const artMin = now.getUTCMinutes();

    // Run at :00-:14 of hours 0 and 12
    if ((artHour === 0 || artHour === 12) && artMin < 15) {
      // Check we haven't already refreshed in the last hour
      if (ga4LastUpdate) {
        const lastMs = new Date(ga4LastUpdate).getTime();
        if (Date.now() - lastMs < 3600000) return; // skip if refreshed < 1h ago
      }
      refreshGA4Data().then(() => { ga4LastError = null; }).catch(err => {
        ga4LastError = err.message;
        console.error('[ga4-cron] Refresh error:', err.message);
      });
    }
  }, 15 * 60 * 1000);
}

// --- Keep-alive ping (prevents Render free tier spindown after 15 min) ---

const SELF_URL = process.env.RENDER_EXTERNAL_URL || `http://localhost:${PORT}`;

setInterval(() => {
  const mod = SELF_URL.startsWith('https') ? https : require('http');
  mod.get(`${SELF_URL}/`, (res) => {
    console.log(`[keep-alive] ping ${res.statusCode}`);
  }).on('error', (err) => {
    console.log(`[keep-alive] ping failed: ${err.message}`);
  });
}, 14 * 60 * 1000); // every 14 minutes

// ============================================================
// REVENUE & SUBSCRIBERS (MercadoPago + Ghost/Stripe → revenue-data.json)
// Mirrors suscriptores/reporte-suscriptores.js. Weekly snapshot appended to
// history (deduped by ISO week). History seeded from the theme asset on boot.
// ============================================================

let revenueData = null;
let revenueLastUpdate = null;
let revenueLastError = null;

function httpsGetJson(hostname, path, headers) {
  return new Promise((resolve, reject) => {
    https.get({ hostname, path, headers: headers || {} }, (res) => {
      let d = '';
      res.on('data', (c) => { d += c; });
      res.on('end', () => {
        try { resolve({ status: res.statusCode, json: JSON.parse(d) }); }
        catch (e) { reject(new Error(`Bad JSON from ${hostname}${path}: ${d.slice(0, 150)}`)); }
      });
    }).on('error', reject);
  });
}

// One /preapproval/search page, retried (MP throttles → short/empty pages)
async function mpSearchPage(offset) {
  let lastErr;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await httpsGetJson('api.mercadopago.com',
        '/preapproval/search?status=authorized&limit=100&offset=' + offset,
        { Authorization: 'Bearer ' + MP_TOKEN });
      if (res.status === 200 && res.json) return res.json;
      lastErr = new Error('MP HTTP ' + res.status);
    } catch (e) { lastErr = e; }
    await new Promise(r => setTimeout(r, 800));
  }
  throw lastErr;
}

// MercadoPago: loop ALL offsets up to paging.total (not "stop on short page",
// which under-counts when MP throttles), dedup by id, split into 4 tiers.
async function getMPSnapshot() {
  const byId = new Map();
  const collect = (results) => {
    for (const s of (results || [])) if (s.status === 'authorized') byId.set(s.id, s);
  };
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));
  // MP throttles under fast paging → returns short/empty pages that under-count.
  // Fix: pause between pages AND run several full passes, unioning by id across
  // passes. A single throttled pass misses subs (mostly the $5 tier); the union
  // recovers the full set. Verified: with these delays every pass returns the full total.
  const PASSES = 3;
  for (let pass = 0; pass < PASSES; pass++) {
    const first = await mpSearchPage(0);
    const total = (first.paging && first.paging.total) || (first.results || []).length;
    collect(first.results);
    for (let offset = 100; offset < total && offset <= 10000; offset += 100) {
      collect((await mpSearchPage(offset)).results);
      await sleep(140);
    }
    await sleep(400);
  }
  const active = Array.from(byId.values());
  let m5 = 0, a50 = 0, m10 = 0, a100 = 0, revM5 = 0, revA50 = 0, revM10 = 0, revA100 = 0;
  for (const s of active) {
    const ar = s.auto_recurring;
    if (!ar) continue;
    const amt = ar.transaction_amount;
    if (ar.frequency === 1 && ar.frequency_type === 'months') {
      if (amt >= 10000) { m10++; revM10 += amt; } else { m5++; revM5 += amt; }
    } else if (ar.frequency === 12 && ar.frequency_type === 'months') {
      if (amt >= 100000) { a100++; revA100 += amt; } else { a50++; revA50 += amt; }
    }
  }
  return { total: active.length, m5, a50, m10, a100, revMensual: revM5 + revM10, revAnual: revA50 + revA100 };
}

// Ghost member counts + active Stripe subscriptions
async function getGhostRevenue() {
  const free = await ghostRequest('GET', '/ghost/api/admin/members/?filter=status:free&limit=1');
  const comped = await ghostRequest('GET', '/ghost/api/admin/members/?filter=status:comped&limit=1');
  const paid = await ghostRequest('GET', '/ghost/api/admin/members/?filter=status:paid&limit=1');
  const f = free.meta.pagination.total, c = comped.meta.pagination.total, p = paid.meta.pagination.total;

  const paidAll = await ghostRequest('GET', '/ghost/api/admin/members/?filter=status:paid&limit=all&include=subscriptions');
  const members = paidAll.members || [];
  let stripeMonthly = 0, stripeAnnual = 0, stripeRevM = 0, stripeRevA = 0;
  for (const m of members) {
    for (const s of (m.subscriptions || [])) {
      if (s.status !== 'active' && s.status !== 'trialing') continue;
      const amt = s.price && s.price.amount ? s.price.amount / 100 : 0;
      const interval = (s.price && s.price.interval) || s.cadence || '';
      if (interval === 'month' || interval === 'monthly') { stripeMonthly++; stripeRevM += amt; }
      else if (interval === 'year' || interval === 'yearly') { stripeAnnual++; stripeRevA += amt; }
      else { if (amt >= 50) { stripeAnnual++; stripeRevA += amt; } else if (amt > 0) { stripeMonthly++; stripeRevM += amt; } }
    }
  }
  return { total: f + c + p, free: f, comped: c, paid: p, stripeMonthly, stripeAnnual, stripeRevM, stripeRevA };
}

// Live blue rate (bluelytics), fallback to env/default
// Tres calidades de dato conviven en la serie histórica, y conviene saberlo antes de sacar
// conclusiones de un gráfico:
//   · 19-06-25 → 09-10-25 : solo total/pagos/ratio. No hay revenue y no se puede reconstruir.
//   · 16-10-25 → 08-01-26 : ARS sí, pero sin blue ni Stripe. El USD de esos 8 snapshots se
//     reconstruyó el 2026-08-04 con el blue histórico de bluelytics (/v2/evolution.json) y
//     quedó marcado con `usd_reconstruido: true`. NO incluye Stripe → subestima un poco.
//   · 15-03-26 en adelante : completo y medido.
async function getBlueRate() {
  try {
    const res = await httpsGetJson('api.bluelytics.com.ar', '/v2/latest', {});
    const v = res.json && res.json.blue && res.json.blue.value_avg;
    if (v && v > 0) return Math.round(v);
  } catch (e) { /* fall through */ }
  return parseInt(process.env.USD_BLUE_RATE, 10) || 1395;
}

function isoWeekKey(d) {
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const day = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const week = Math.ceil((((date - yearStart) / 86400000) + 1) / 7);
  return date.getUTCFullYear() + '-W' + String(week).padStart(2, '0');
}
function parseDDMMYY(s) { if (!s || typeof s !== 'string') return new Date(0); const p = s.split('-').map(Number); return new Date(2000 + p[2], p[1] - 1, p[0]); }

async function refreshRevenueData() {
  if (!REVENUE_ENABLED) throw new Error('Revenue disabled (missing MERCADOPAGO_ACCESS_TOKEN)');
  const start = Date.now();
  const [ghost, mp, blue] = await Promise.all([getGhostRevenue(), getMPSnapshot(), getBlueRate()]);

  const totalPagos = mp.m5 + mp.a50 + mp.m10 + mp.a100 + ghost.stripeMonthly + ghost.stripeAnnual;
  const ratio = ghost.total ? parseFloat((totalPagos / ghost.total * 100).toFixed(2)) : 0;
  const revUsdM = Math.round(mp.revMensual / blue) + Math.round(ghost.stripeRevM);
  const revUsdA = Math.round(mp.revAnual / blue) + Math.round(ghost.stripeRevA);

  const now = new Date();
  const dateStr = now.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: '2-digit' }).replace(/\//g, '-');

  const snapshot = {
    date: dateStr, total: ghost.total, pagos: totalPagos, ratio,
    mp_m5: mp.m5, mp_a50: mp.a50, mp_m10: mp.m10, mp_a100: mp.a100,
    stripe_m: ghost.stripeMonthly, stripe_a: ghost.stripeAnnual,
    rev_mens_ars: Math.round(mp.revMensual), rev_anual_ars: Math.round(mp.revAnual),
    stripe_rev_m: parseFloat(ghost.stripeRevM.toFixed(2)), stripe_rev_a: parseFloat(ghost.stripeRevA.toFixed(2)),
    rev_usd_m: revUsdM, rev_usd_a: revUsdA, blue_ref: blue
  };

  // Merge into history, deduped by ISO week (replace same-week, else append)
  const history = (revenueData && Array.isArray(revenueData.history)) ? revenueData.history.slice() : [];
  const wk = isoWeekKey(now);
  if (history.length && isoWeekKey(parseDDMMYY(history[history.length - 1].date)) === wk) {
    history[history.length - 1] = snapshot;
  } else {
    history.push(snapshot);
  }

  revenueData = {
    generated: now.toISOString().split('T')[0],
    source: 'live (MercadoPago + Ghost/Stripe)',
    blue_ref: blue,
    current: snapshot,
    history
  };
  revenueLastUpdate = new Date().toISOString();
  console.log(`[revenue] Refresh done in ${((Date.now() - start) / 1000).toFixed(1)}s: pagos=${totalPagos}, total=${ghost.total}, MRR USD=${revUsdM}, blue=${blue}, weeks=${history.length}`);
  await saveRevenueStore(revenueData); // persist to private store while the instance is active (Render free-tier freezes post-response background work)
}

// --- Private revenue history store (Ghost draft page) ---
// Persists revenue-data to a non-public Ghost draft page so history survives Render
// restarts WITHOUT relying on the public /assets/data/revenue-data.json (which only
// still works because it's stuck in Fastly cache). Read/written via the Admin API the
// webhook already has. Lets us purge the public asset without losing the weekly series.
const REVENUE_STORE_SLUG = 'revenue-data-store';

// NOTE: this webhook's ghostRequest returns the PARSED BODY directly (e.g. {pages:[...]})
// and THROWS on non-2xx (incl. 404). Handle accordingly (do not read .status/.data).
async function loadRevenueStore() {
  try {
    const data = await ghostRequest('GET', `/ghost/api/admin/pages/slug/${REVENUE_STORE_SLUG}/`);
    const page = data && data.pages && data.pages[0];
    if (page && page.codeinjection_foot) {
      const obj = JSON.parse(page.codeinjection_foot);
      // Only trust well-formed data: history must be snapshots that each carry a date.
      // Guards against a corrupt/placeholder store poisoning the in-memory revenueData.
      if (obj && Array.isArray(obj.history) && obj.history.length && obj.history.every(h => h && typeof h.date === 'string')) {
        return obj;
      }
    }
  } catch (e) { /* 404 = store page not created yet, or unreadable */ }
  return null;
}

async function saveRevenueStore(obj) {
  const blob = JSON.stringify(obj);
  let page = null;
  try {
    const data = await ghostRequest('GET', `/ghost/api/admin/pages/slug/${REVENUE_STORE_SLUG}/`);
    page = data && data.pages && data.pages[0];
  } catch (e) {
    // SOLO un 404 significa "todavía no existe". Cualquier otro error es transitorio, y
    // tratarlo como 404 crea una página nueva que Ghost slugifica -2, -3... dejando el
    // store real huérfano. Así aparecieron 5 revenue-data-store-N el 2026-07-28.
    if (!/Ghost API 404/.test(e.message)) {
      console.error(`[revenue-store] store ilegible (${e.message}) — no escribo para no duplicarlo`);
      return;
    }
    page = null;
  }

  // La serie solo crece. Si lo que vamos a escribir tiene menos semanas que lo que ya
  // está guardado, algo salió mal aguas arriba (bootstrap que no cargó → history vacío)
  // y sobrescribir borraría meses de historia irrecuperable.
  if (page && page.codeinjection_foot) {
    try {
      const prev = JSON.parse(page.codeinjection_foot);
      const prevLen = (prev && Array.isArray(prev.history)) ? prev.history.length : 0;
      const newLen = (obj && Array.isArray(obj.history)) ? obj.history.length : 0;
      if (prevLen > newLen) {
        console.error(`[revenue-store] ABORTO: guardado tiene ${prevLen} semanas y el nuevo ${newLen}. No piso la historia.`);
        return;
      }
    } catch (e) { /* store previo ilegible: seguimos, el PUT lo repara */ }
  }

  try {
    if (page) {
      await ghostRequest('PUT', `/ghost/api/admin/pages/${page.id}/`, { pages: [{ codeinjection_foot: blob, updated_at: page.updated_at }] });
    } else {
      await ghostRequest('POST', '/ghost/api/admin/pages/', { pages: [{ title: 'Revenue data store (internal — do not publish)', slug: REVENUE_STORE_SLUG, status: 'draft', codeinjection_foot: blob }] });
      console.log('[revenue-store] created draft store page');
    }
  } catch (e) { console.error(`[revenue-store] save failed: ${e.message}`); }
}

// Verificación de pertenencia al equipo, sin payload. La usa /es/tarifario/ para decidir
// si muestra los precios. Antes ese gate leía el array `team` de ga4-data.json, pero ese
// campo se saca del payload público a propósito (son hashes de los emails del equipo en un
// endpoint world-readable), así que el tarifario quedó sin poder desbloquear a nadie.
// Devuelve solo {ok:true}: no hay nada que filtrar si alguien la llama sin credenciales.
app.options('/api/team-check', teamPreflight);
app.get('/api/team-check', requireTeam, (req, res) => {
  res.set('Cache-Control', 'private, no-store');
  res.json({ ok: true });
});

app.options('/api/revenue-data.json', teamPreflight);
app.get('/api/revenue-data.json', requireTeam, (req, res) => {
  // Sensitive: revenue/MRR/tiers. Team-only (requireTeam) + never cached by shared caches.
  res.set('Cache-Control', 'private, no-store');
  if (!revenueData) { res.status(503).json({ error: 'Revenue data not ready yet' }); return; }
  res.json(revenueData);
});

app.post('/api/revenue-refresh', async (req, res) => {
  try {
    await refreshRevenueData();
    res.json({ ok: true, pagos: revenueData.current.pagos, total: revenueData.current.total, weeks: revenueData.history.length, blue: revenueData.blue_ref });
  } catch (e) {
    revenueLastError = e.message;
    res.status(500).json({ ok: false, error: e.message });
  }
});

function scheduleRevenueCron() {
  // Semanal, autónomo: chequea cada 6h y refresca si todavía no hay snapshot de la semana
  // ISO en curso. Las merges de historia deduplican por semana ISO, así que un refresh de
  // más es inofensivo.
  //
  // OJO al leer la serie vieja: entre 23-03-26 y 28-07-26 no hay snapshots, y NO fue este
  // cron. Hasta el 2026-07-28 no existía el store privado y la historia solo sobrevivía si
  // alguien la commiteaba al asset público del theme. Con el store, ese agujero no se repite.
  // La decisión sale del estado PERSISTIDO (la fecha del último snapshot), no de un
  // contador en memoria. El bucket epoch anterior se reinicializaba a la semana actual en
  // cada arranque, así que solo detectaba el cambio de semana si el proceso seguía vivo al
  // cruzarla — en Render eso no está garantizado. Además, leyendo la historia el cron se
  // auto-repara: si un refresh falla, el próximo tick (6h) lo vuelve a intentar en vez de
  // esperar al siguiente bucket.
  setInterval(() => {
    const h = (revenueData && Array.isArray(revenueData.history)) ? revenueData.history : [];
    const ultima = h.length ? h[h.length - 1].date : null;
    if (ultima && isoWeekKey(parseDDMMYY(ultima)) === isoWeekKey(new Date())) return; // ya hay snapshot de esta semana
    refreshRevenueData().then(() => { revenueLastError = null; console.log('[revenue-cron] Weekly refresh done'); }).catch(err => {
      revenueLastError = err.message;
      console.error('[revenue-cron] Refresh error:', err.message);
    });
  }, 6 * 60 * 60 * 1000);
}

// --- Emails automatizados (drip de altas nuevas + campañas por segmento) ---
// Diseño: contenido/automatizacion-emails.md · Textos: ./copys.js
const emailsAuto = require('./emails-automaticos');

// GET  /api/emails/preview        → qué mandaría hoy, sin tocar nada
// POST /api/emails/run            → dispara la corrida (body: {dry, hoy, solo, filtroOverride})
// Protegido con el mismo patrón que el resto: header x-webhook-key.
app.get('/api/emails/preview', async (req, res) => {
  try {
    const log = await emailsAuto.correr({ dry: true, hoy: req.query.hoy });
    res.json({ ok: true, dry: true, log });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

app.post('/api/emails/run', async (req, res) => {
  if (!process.env.EMAILS_RUN_KEY || req.headers['x-webhook-key'] !== process.env.EMAILS_RUN_KEY) {
    return res.status(401).json({ ok: false, error: 'unauthorized' });
  }
  const { dry = true, hoy, solo, filtroOverride } = req.body || {};
  try {
    const log = await emailsAuto.correr({ dry, hoy, solo, filtroOverride });
    res.json({ ok: true, dry, log });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// --- Start ---

app.listen(PORT, () => {
  emailsAuto.iniciar();
  const missing = [];
  if (!GHOST_ADMIN_KEY) missing.push('GHOST_ADMIN_KEY');
  if (!GHOST_CONTENT_KEY) missing.push('GHOST_CONTENT_KEY');
  if (!GHOST_URL) missing.push('GHOST_URL');
  if (missing.length) {
    console.warn(`[hreflang] WARNING: Missing env vars: ${missing.join(', ')}`);
  }
  console.log(`[hreflang] Listening on port ${PORT}`);
  console.log(`[translate] Auto-translate: ${AUTO_TRANSLATE_ENABLED ? 'ENABLED (6 langs)' : 'DISABLED (no ANTHROPIC_API_KEY)'}`);
  console.log(`[keep-alive] Self-ping every 14min -> ${SELF_URL}`);

  // Bootstrap related posts on startup
  bootstrapRelatedPosts();

  // Bootstrap focal points on startup (load base + fill recent)
  bootstrapFocal().catch(err => console.error(`[focal] Bootstrap error: ${err.message}`));

  // Run first hreflang cron check 60s after startup
  setTimeout(hreflangCron, 60 * 1000);

  // Bootstrap GA4 data: try theme asset first, then refresh
  if (GA4_ENABLED) {
    (async () => {
      try {
        console.log('[ga4] Bootstrapping from theme asset...');
        const existing = await new Promise((resolve, reject) => {
          https.get('https://www.421.news/assets/data/ga4-data.json', (res) => {
            let body = '';
            res.on('data', (c) => { body += c; });
            res.on('end', () => {
              if (res.statusCode === 200) resolve(JSON.parse(body));
              else reject(new Error(`HTTP ${res.statusCode}`));
            });
          }).on('error', reject);
        });
        ga4Data = existing;
        ga4LastUpdate = existing.generated + 'T00:00:00Z';
        console.log(`[ga4] Bootstrap loaded from theme (generated: ${existing.generated})`);
      } catch (e) {
        console.log(`[ga4] Bootstrap from theme failed: ${e.message}`);
      }
      // Refresh fresh data 30s after startup
      setTimeout(() => {
        refreshGA4Data().then(() => { ga4LastError = null; }).catch(err => { ga4LastError = err.message; console.error('[ga4] Initial refresh error:', err.message); });
      }, 30000);
    })();
    scheduleGA4Cron();
  } else {
    console.log('[ga4] GA4 credentials not set, GA4 endpoint disabled');
  }

  // Bootstrap revenue data: seed history from the private Ghost store (survives restarts
  // + Fastly purge). Fall back to the public theme asset only during the transition.
  if (REVENUE_ENABLED) {
    (async () => {
      try {
        const stored = await loadRevenueStore();
        if (stored && Array.isArray(stored.history)) {
          revenueData = stored;
          console.log(`[revenue] Bootstrap loaded from private store (${stored.history.length} weeks)`);
        } else {
          const existing = await httpsGetJson('www.421.news', '/assets/data/revenue-data.json', {});
          if (existing.status === 200 && existing.json && Array.isArray(existing.json.history)) {
            revenueData = existing.json;
            console.log(`[revenue] Bootstrap fell back to theme asset (${existing.json.history.length} weeks)`);
          }
        }
      } catch (e) {
        console.log(`[revenue] Bootstrap failed: ${e.message}`);
      }
      // Refresh live snapshot 45s after startup
      setTimeout(() => {
        refreshRevenueData().then(() => { revenueLastError = null; })
          .catch(err => { revenueLastError = err.message; console.error('[revenue] Initial refresh error:', err.message); });
      }, 45000);
    })();
    scheduleRevenueCron();
  } else {
    console.log('[revenue] Disabled (set MERCADOPAGO_ACCESS_TOKEN to enable)');
  }
});
