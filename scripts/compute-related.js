#!/usr/bin/env node
// Computes semantically related posts using Claude and saves as JSON.
// Usage: ANTHROPIC_API_KEY=sk-... node scripts/compute-related.js

const https = require('https');
const fs = require('fs');
const path = require('path');

const CONTENT_API_KEY = '420da6f85b5cc903b347de9e33';
const GHOST_HOST = 'www.421.news';
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const BATCH_SIZE = 80; // focal posts per Claude request

function httpGet(host, urlPath) {
    return new Promise((resolve, reject) => {
        https.get({ hostname: host, path: urlPath }, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try { resolve(JSON.parse(data)); }
                catch (e) { reject(new Error('JSON parse error: ' + data.substring(0, 200))); }
            });
        }).on('error', reject);
    });
}

async function fetchAllPosts() {
    let all = [];
    let page = 1;
    while (true) {
        const urlPath = `/ghost/api/content/posts/?key=${CONTENT_API_KEY}&page=${page}&limit=100&include=tags&fields=slug,title,excerpt,custom_excerpt`;
        console.log(`  Fetching page ${page}...`);
        const data = await httpGet(GHOST_HOST, urlPath);
        if (!data.posts) {
            console.error('Unexpected API response:', JSON.stringify(data).substring(0, 300));
            break;
        }
        all = all.concat(data.posts);
        if (!data.meta.pagination.next) break;
        page++;
    }
    return all;
}

function groupByLanguage(posts) {
    const es = posts.filter(p => p.tags && p.tags.some(t => t.slug === 'hash-es'));
    const en = posts.filter(p => p.tags && p.tags.some(t => t.slug === 'hash-en'));
    return { es, en };
}

function callClaude(prompt) {
    return new Promise((resolve, reject) => {
        const body = JSON.stringify({
            model: 'claude-haiku-4-5-20251001',
            max_tokens: 16000,
            messages: [{ role: 'user', content: prompt }]
        });

        const req = https.request({
            hostname: 'api.anthropic.com',
            path: '/v1/messages',
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': ANTHROPIC_API_KEY,
                'anthropic-version': '2023-06-01'
            }
        }, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    const parsed = JSON.parse(data);
                    if (parsed.error) {
                        reject(new Error(parsed.error.message));
                        return;
                    }
                    const text = parsed.content[0].text;
                    const jsonMatch = text.match(/\{[\s\S]*\}/);
                    if (jsonMatch) {
                        resolve(JSON.parse(jsonMatch[0]));
                    } else {
                        reject(new Error('No JSON in response: ' + text.substring(0, 200)));
                    }
                } catch (e) {
                    reject(new Error('Parse error: ' + e.message + ' | ' + data.substring(0, 200)));
                }
            });
        });

        req.on('error', reject);
        req.write(body);
        req.end();
    });
}

function buildPrompt(focalPosts, allPosts, lang) {
    const langName = lang === 'es' ? 'Spanish' : 'English';

    const pool = allPosts.map((p, i) =>
        `[${i}] "${p.title}" (${p.tags.filter(t => t.visibility === 'public').map(t => t.name).join(', ')})`
    ).join('\n');

    const focal = focalPosts.map(p => {
        const excerpt = (p.custom_excerpt || p.excerpt || '').substring(0, 200);
        return `- slug: "${p.slug}" | title: "${p.title}" | excerpt: "${excerpt}"`;
    }).join('\n');

    return `You are a content recommendation engine for a ${langName} blog.

FULL POST CATALOG (${allPosts.length} posts):
${pool}

FOR EACH OF THESE ${focalPosts.length} FOCAL POSTS, find the 4 most semantically related posts from the catalog above. Consider topic overlap, thematic connections, and subject matter. Do NOT recommend a post to itself.

FOCAL POSTS:
${focal}

Return ONLY a valid JSON object. Keys = focal post slugs, values = arrays of exactly 4 related post slugs from the catalog.`;
}

async function computeRelated(posts, lang) {
    const slugSet = new Set(posts.map(p => p.slug));
    const result = {};

    for (let i = 0; i < posts.length; i += BATCH_SIZE) {
        const batch = posts.slice(i, i + BATCH_SIZE);
        console.log(`  Processing batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(posts.length / BATCH_SIZE)} (${batch.length} posts)...`);

        const prompt = buildPrompt(batch, posts, lang);
        let batchResult;

        try {
            batchResult = await callClaude(prompt);
        } catch (err) {
            console.error(`  Error on batch: ${err.message}. Retrying...`);
            await new Promise(r => setTimeout(r, 5000));
            batchResult = await callClaude(prompt);
        }

        // Validate: only keep slugs that exist in our post set
        for (const [slug, related] of Object.entries(batchResult)) {
            if (slugSet.has(slug)) {
                result[slug] = related.filter(s => slugSet.has(s) && s !== slug).slice(0, 4);
            }
        }
    }

    // Fill any missing posts with empty arrays
    for (const p of posts) {
        if (!result[p.slug] || result[p.slug].length === 0) {
            result[p.slug] = [];
        }
    }

    return result;
}

async function main() {
    if (!ANTHROPIC_API_KEY) {
        console.error('Usage: ANTHROPIC_API_KEY=sk-... node scripts/compute-related.js');
        process.exit(1);
    }

    console.log('Fetching all posts from Ghost...');
    const allPosts = await fetchAllPosts();
    console.log(`Fetched ${allPosts.length} posts total`);

    const { es, en } = groupByLanguage(allPosts);
    console.log(`ES: ${es.length} posts | EN: ${en.length} posts`);

    const result = {};

    if (es.length > 0) {
        console.log('\nComputing ES related posts...');
        Object.assign(result, await computeRelated(es, 'es'));
    }

    if (en.length > 0) {
        console.log('\nComputing EN related posts...');
        Object.assign(result, await computeRelated(en, 'en'));
    }

    const outPath = path.join(__dirname, '..', 'assets', 'data', 'related-posts.json');
    fs.writeFileSync(outPath, JSON.stringify(result));
    console.log(`\nSaved ${Object.keys(result).length} posts to ${outPath}`);
}

main().catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
});
