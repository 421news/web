const express = require('express');
const jwt = require('jsonwebtoken');
const https = require('https');

const app = express();
app.use(express.json());

// --- Config from env vars ---
const GHOST_ADMIN_KEY = process.env.GHOST_ADMIN_KEY;
const GHOST_CONTENT_KEY = process.env.GHOST_CONTENT_KEY;
const GHOST_URL = process.env.GHOST_URL; // e.g. https://421bn.ghost.io
const PORT = process.env.PORT || 10000;

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

// --- Pairing algorithm (simplified from generate-hreflang-sitemap.py) ---

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

function computeScore(postA, postB) {
  const tsA = parseTimestamp(postA.published_at);
  const tsB = parseTimestamp(postB.published_at);
  if (!tsA || !tsB) return 0;

  const delta = Math.abs(tsA - tsB);
  const MAX_DELTA = 172800; // 48h

  // Auto-match if within 2 minutes
  if (delta <= 120) return 1.0;

  // Beyond 48h: no match
  if (delta > MAX_DELTA) return 0;

  // Slug word overlap score (0 or 0.6)
  const hasOverlap = slugsShareWords(postA.slug, postB.slug);
  if (!hasOverlap) return 0;

  const slugScore = 0.6;

  // Temporal proximity score (0..0.4), linear decay over 48h
  const timeScore = 0.4 * (1 - delta / MAX_DELTA);

  return slugScore + timeScore;
}

// --- Meta tag injection ---

function hasHreflangMeta(codeinjection, metaName) {
  if (!codeinjection) return false;
  return codeinjection.includes(`name="${metaName}"`);
}

async function injectMeta(postId, metaName, metaValue) {
  // Fetch current post state (need updated_at for optimistic locking)
  const current = await ghostRequest('GET', `/ghost/api/admin/posts/${postId}/`);
  const post = current.posts[0];
  const existing = post.codeinjection_head || '';

  const metaTag = `<meta name="${metaName}" content="${metaValue}" />`;

  // Skip if already present
  if (existing.includes(metaTag)) {
    return { skipped: true, reason: 'already-tagged' };
  }

  // Also skip if there's already a tag with this name (different value = stale pair, don't overwrite)
  if (hasHreflangMeta(existing, metaName)) {
    return { skipped: true, reason: 'has-existing-tag' };
  }

  const newInjection = existing ? `${existing}\n${metaTag}` : metaTag;

  await ghostRequest('PUT', `/ghost/api/admin/posts/${postId}/`, {
    posts: [{ codeinjection_head: newInjection, updated_at: post.updated_at }]
  });

  return { skipped: false };
}

// --- Webhook handler ---

async function handleWebhook(payload) {
  const post = payload?.post?.current;
  if (!post) {
    return { status: 'ignored', reason: 'no post data in payload' };
  }

  const postSlug = post.slug;
  const postId = post.id;
  const tags = (post.tags || []).map(t => t.slug);
  const isEnglish = tags.includes('hash-en');
  const lang = isEnglish ? 'EN' : 'ES';

  console.log(`[hreflang] Post published: "${post.title}" (${lang}, slug: ${postSlug})`);

  // Determine what to search for
  const otherLangFilter = isEnglish ? 'tag:-hash-en' : 'tag:hash-en';
  const publishedAt = post.published_at;

  if (!publishedAt) {
    return { status: 'ignored', reason: 'no published_at' };
  }

  // Fetch recent posts in the other language (last 7 days, limit 50)
  const data = await contentAPIGet(
    `/ghost/api/content/posts/?key=${GHOST_CONTENT_KEY}` +
    `&filter=${encodeURIComponent(otherLangFilter)}` +
    `&limit=50&order=published_at%20desc` +
    `&include=tags&fields=id,slug,title,published_at`
  );

  const candidates = data.posts || [];
  console.log(`[hreflang] Found ${candidates.length} candidate posts in other language`);

  // Score all candidates
  let bestMatch = null;
  let bestScore = 0;

  for (const candidate of candidates) {
    const score = computeScore(post, candidate);
    if (score > bestScore) {
      bestScore = score;
      bestMatch = candidate;
    }
  }

  const THRESHOLD = 0.3;
  if (!bestMatch || bestScore < THRESHOLD) {
    console.log(`[hreflang] No match found (best score: ${bestScore.toFixed(3)})`);
    return { status: 'no-match', bestScore: bestScore.toFixed(3) };
  }

  console.log(`[hreflang] Match: "${bestMatch.title}" (slug: ${bestMatch.slug}, score: ${bestScore.toFixed(3)})`);

  // Inject meta tags in both posts
  const esPost = isEnglish ? bestMatch : post;
  const enPost = isEnglish ? post : bestMatch;
  const esId = isEnglish ? bestMatch.id : postId;
  const enId = isEnglish ? postId : bestMatch.id;

  const results = {};

  // ES post gets english-version tag
  try {
    results.es = await injectMeta(esId, 'english-version', enPost.slug);
    console.log(`[hreflang] ES post (${esPost.slug}): ${results.es.skipped ? results.es.reason : 'injected'}`);
  } catch (err) {
    console.error(`[hreflang] Error injecting ES post: ${err.message}`);
    results.es = { error: err.message };
  }

  // EN post gets spanish-version tag
  try {
    results.en = await injectMeta(enId, 'spanish-version', esPost.slug);
    console.log(`[hreflang] EN post (${enPost.slug}): ${results.en.skipped ? results.en.reason : 'injected'}`);
  } catch (err) {
    console.error(`[hreflang] Error injecting EN post: ${err.message}`);
    results.en = { error: err.message };
  }

  return {
    status: 'matched',
    score: bestScore.toFixed(3),
    pair: { es: esPost.slug, en: enPost.slug },
    injection: results
  };
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

// --- Routes ---

app.get('/', (req, res) => {
  res.json({ status: 'ok', service: 'webhook-hreflang', version: '1.1.0' });
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

// CORS preflight for the JSON endpoint
app.options('/api/related-posts.json', (req, res) => {
  res.set('Access-Control-Allow-Origin', 'https://www.421.news');
  res.set('Access-Control-Allow-Methods', 'GET');
  res.set('Access-Control-Allow-Headers', 'Content-Type');
  res.status(204).end();
});

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

// --- Start ---

app.listen(PORT, () => {
  const missing = [];
  if (!GHOST_ADMIN_KEY) missing.push('GHOST_ADMIN_KEY');
  if (!GHOST_CONTENT_KEY) missing.push('GHOST_CONTENT_KEY');
  if (!GHOST_URL) missing.push('GHOST_URL');
  if (missing.length) {
    console.warn(`[hreflang] WARNING: Missing env vars: ${missing.join(', ')}`);
  }
  console.log(`[hreflang] Listening on port ${PORT}`);
  console.log(`[keep-alive] Self-ping every 14min → ${SELF_URL}`);

  // Bootstrap related posts on startup
  bootstrapRelatedPosts();
});
