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

// --- Hreflang tag injection ---

/**
 * Strip all existing hreflang-related tags from codeinjection_head.
 * Removes:
 *   - <meta name="english-version" ...>
 *   - <meta name="spanish-version" ...>
 *   - <link rel="alternate" hreflang="..." ...>
 * Returns cleaned string (may have trailing whitespace stripped).
 */
function stripHreflangTags(html) {
  if (!html) return '';
  return html
    .replace(/<meta\s+name="(?:english|spanish)-version"\s+content="[^"]*"\s*\/?>\s*/gi, '')
    .replace(/<link\s+rel="alternate"\s+hreflang="[^"]*"\s+href="[^"]*"\s*\/?>\s*/gi, '')
    .trim();
}

/**
 * Build the hreflang <link> tag for a given language and slug.
 */
function buildHreflangLink(lang, slug) {
  const prefix = lang === 'en' ? '/en/' : '/es/';
  return `<link rel="alternate" hreflang="${lang}" href="https://www.421.news${prefix}${slug}/" />`;
}

/**
 * Inject hreflang tags (meta + link) into a post's codeinjection_head.
 *
 * @param {string} postId - Ghost post ID to update
 * @param {string} postLang - Language of this post: 'es' or 'en'
 * @param {string} postSlug - Slug of this post
 * @param {string|null} pairSlug - Slug of the translation pair (null if no pair found)
 */
async function injectHreflangTags(postId, postLang, postSlug, pairSlug) {
  // Fetch current post state (need updated_at for optimistic locking)
  const current = await ghostRequest('GET', `/ghost/api/admin/posts/${postId}/`);
  const post = current.posts[0];
  const existing = post.codeinjection_head || '';

  // Build the tags to inject
  const tags = [];

  if (pairSlug) {
    // Has a translation pair: inject meta tag + both hreflang links
    if (postLang === 'es') {
      tags.push(`<meta name="english-version" content="${pairSlug}" />`);
      tags.push(buildHreflangLink('es', postSlug));
      tags.push(buildHreflangLink('en', pairSlug));
    } else {
      tags.push(`<meta name="spanish-version" content="${pairSlug}" />`);
      tags.push(buildHreflangLink('en', postSlug));
      tags.push(buildHreflangLink('es', pairSlug));
    }
  } else {
    // No translation pair: self-referential hreflang only
    tags.push(buildHreflangLink(postLang, postSlug));
  }

  const tagsBlock = tags.join('\n');

  // Strip old hreflang tags from existing content (idempotent)
  const cleaned = stripHreflangTags(existing);

  // Check if the cleaned content + new tags would be identical to what's already there
  const newInjection = cleaned ? `${cleaned}\n${tagsBlock}` : tagsBlock;

  if (newInjection === existing.trim()) {
    return { skipped: true, reason: 'already-tagged' };
  }

  await ghostRequest('PUT', `/ghost/api/admin/posts/${postId}/`, {
    posts: [{ codeinjection_head: newInjection, updated_at: post.updated_at }]
  });

  return { skipped: false, tags: tags.length };
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
  const postLang = isEnglish ? 'en' : 'es';

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

    // No pair found: inject self-referential hreflang only
    try {
      const result = await injectHreflangTags(postId, postLang, postSlug, null);
      console.log(`[hreflang] Self-referential hreflang for ${postSlug}: ${result.skipped ? result.reason : 'injected'}`);
    } catch (err) {
      console.error(`[hreflang] Error injecting self-referential hreflang: ${err.message}`);
    }

    return { status: 'no-match', bestScore: bestScore.toFixed(3), selfHreflang: true };
  }

  console.log(`[hreflang] Match: "${bestMatch.title}" (slug: ${bestMatch.slug}, score: ${bestScore.toFixed(3)})`);

  // Inject hreflang tags in both posts
  const esPost = isEnglish ? bestMatch : post;
  const enPost = isEnglish ? post : bestMatch;
  const esId = isEnglish ? bestMatch.id : postId;
  const enId = isEnglish ? postId : bestMatch.id;

  const results = {};

  // ES post gets: meta english-version + hreflang links for both ES and EN
  try {
    results.es = await injectHreflangTags(esId, 'es', esPost.slug, enPost.slug);
    console.log(`[hreflang] ES post (${esPost.slug}): ${results.es.skipped ? results.es.reason : 'injected'}`);
  } catch (err) {
    console.error(`[hreflang] Error injecting ES post: ${err.message}`);
    results.es = { error: err.message };
  }

  // EN post gets: meta spanish-version + hreflang links for both EN and ES
  try {
    results.en = await injectHreflangTags(enId, 'en', enPost.slug, esPost.slug);
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
  res.json({ status: 'ok', service: 'webhook-hreflang', version: '1.5.0', ga4: ga4Data ? 'ready' : 'not loaded' });
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

    for (const post of posts) {
      const tags = (post.tags || []).map(t => t.slug);
      const isEnglish = tags.includes('hash-en');
      const metaName = isEnglish ? 'spanish-version' : 'english-version';
      const head = post.codeinjection_head || '';

      // Check if post is missing hreflang <link> tags (the new requirement)
      const hasHreflangLink = head.includes('rel="alternate"') && head.includes('hreflang=');
      // Also check for the legacy meta tag
      const hasMetaTag = head.includes(`name="${metaName}"`);

      // Skip if already has both hreflang link tags
      // (posts with meta but without link tags still need updating)
      if (hasHreflangLink && hasMetaTag) {
        continue;
      }

      // Also skip if has self-referential hreflang and no pair is expected
      // (we'll let handleWebhook figure out if there's a pair)
      if (hasHreflangLink && !hasMetaTag) {
        // Has a self-referential link but no meta = no pair was found before.
        // Re-run to check if a pair has been published since.
        // (handleWebhook will upgrade from self-referential to full pair if found)
      }

      // Run the pairing handler
      const result = await handleWebhook({
        post: { current: { id: post.id, slug: post.slug, title: post.title, published_at: post.published_at, tags: post.tags } }
      });

      if (result.status === 'matched') {
        processed++;
        console.log(`[hreflang-cron] Paired: ${result.pair.es} <-> ${result.pair.en}`);
      } else if (result.status === 'no-match' && result.selfHreflang) {
        if (!hasHreflangLink) {
          processed++;
          console.log(`[hreflang-cron] Self-hreflang injected for: ${post.slug}`);
        }
      }
    }

    console.log(`[hreflang-cron] Done: ${processed} posts updated`);
  } catch (err) {
    console.error(`[hreflang-cron] Error: ${err.message}`);
  }
}

setInterval(hreflangCron, 30 * 60 * 1000); // every 30 minutes

// =============================================================================
// GA4 ANALYTICS DATA (queries GA4 Data API, serves /api/ga4-data.json)
// =============================================================================

const GA4_PROPERTY_ID = '459246312';
// Support both: individual env vars (preferred) or full JSON blob
const GA4_CLIENT_ID = process.env.GA4_CLIENT_ID;
const GA4_CLIENT_SECRET = process.env.GA4_CLIENT_SECRET;
const GA4_REFRESH_TOKEN = process.env.GA4_REFRESH_TOKEN;
const GA4_SERVICE_ACCOUNT_JSON = process.env.GA4_SERVICE_ACCOUNT_JSON;
const GA4_ENABLED = !!(GA4_CLIENT_ID || GA4_SERVICE_ACCOUNT_JSON);

let ga4Data = null;
let ga4LastUpdate = null;
let ga4LastError = null;

// --- GA4 auth: OAuth refresh token → access token ---

async function getGA4AccessToken() {
  const { GoogleAuth, UserRefreshClient } = require('google-auth-library');

  // Preferred: individual env vars (avoids JSON parsing issues)
  if (GA4_CLIENT_ID && GA4_CLIENT_SECRET && GA4_REFRESH_TOKEN) {
    const client = new UserRefreshClient(GA4_CLIENT_ID, GA4_CLIENT_SECRET, GA4_REFRESH_TOKEN);
    const token = await client.getAccessToken();
    return token.token || token;
  }

  // Fallback: full JSON blob
  if (GA4_SERVICE_ACCOUNT_JSON) {
    const creds = JSON.parse(GA4_SERVICE_ACCOUNT_JSON);
    const auth = new GoogleAuth({
      credentials: creds,
      scopes: ['https://www.googleapis.com/auth/analytics.readonly']
    });
    const client = await auth.getClient();
    const token = await client.getAccessToken();
    return token.token || token;
  }

  throw new Error('GA4 credentials not configured (set GA4_CLIENT_ID + GA4_CLIENT_SECRET + GA4_REFRESH_TOKEN)');
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

function processGA4Results(pageRows, channelRows, monthlyRows) {
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
        // Treat as page
        const totalPV = Object.values(months).reduce((s, m) => s + m.pv, 0);
        if (totalPV >= 50 && !pageMap[path]) pageMap[path] = { path, title: slug, type: 'editorial', en: path.startsWith('/en/'), m: months };
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

  // Sort articles by total PV, take top 100
  const articles = Object.values(articleMap).map(a => {
    let totalPV = 0;
    for (const m of Object.values(a.m)) totalPV += m.pv;
    return { ...a, totalPV };
  }).sort((a, b) => b.totalPV - a.totalPV).slice(0, 100).map(a => {
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

  const today = new Date();
  const generated = today.toISOString().split('T')[0];

  return {
    team: ['00285f8378c256764d05b03690b04ab876110c230a199a060064c33bfc734d24', '708e778156d49e0e207733e8f57251fbff7189c94bccbd175afafd04608c06e7'],
    generated,
    range: { start: '2024-09-18', end: generated },
    monthly, articles, pages, channels
  };
}

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

  // Run 3 queries in parallel
  const [pageResult, channelResult, monthlyResult] = await Promise.all([
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
    })
  ]);

  console.log(`[ga4] Queries done: pages=${pageResult.rowCount}, channels=${channelResult.rowCount}, monthly=${monthlyResult.rowCount}`);

  ga4Data = processGA4Results(
    pageResult.rows || [],
    channelResult.rows || [],
    monthlyResult.rows || []
  );

  await enrichArticleTitles(ga4Data);

  ga4LastUpdate = new Date().toISOString();
  const elapsed = ((Date.now() - start) / 1000).toFixed(1);
  console.log(`[ga4] Refresh complete in ${elapsed}s: ${ga4Data.articles.length} articles, ${ga4Data.pages.length} pages`);
}

// --- GA4 endpoint ---

app.get('/api/ga4-data.json', (req, res) => {
  res.set('Access-Control-Allow-Origin', 'https://www.421.news');
  res.set('Cache-Control', 'public, max-age=300');
  if (!ga4Data) {
    res.status(503).json({ error: 'GA4 data not ready yet' });
    return;
  }
  res.json(ga4Data);
});

app.options('/api/ga4-data.json', (req, res) => {
  res.set('Access-Control-Allow-Origin', 'https://www.421.news');
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
      hasCredentials: !!GA4_SERVICE_ACCOUNT_JSON,
      credentialType: credType,
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
  console.log(`[keep-alive] Self-ping every 14min -> ${SELF_URL}`);

  // Bootstrap related posts on startup
  bootstrapRelatedPosts();

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
});
