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

// --- Routes ---

app.get('/', (req, res) => {
  res.json({ status: 'ok', service: 'webhook-hreflang', version: '1.0.0' });
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
});
