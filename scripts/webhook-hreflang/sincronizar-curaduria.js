#!/usr/bin/env node
'use strict';
/**
 * CLI del sweep de curaduría. Corre lo mismo que el cron diario del server,
 * pero desde la máquina, para el backfill y para verificar a mano.
 *
 *   node sincronizar-curaduria.js --dry     # solo reporta
 *   node sincronizar-curaduria.js           # escribe
 *
 * La key sale de GHOST_ADMIN_KEY (env) o del .env de al lado.
 */

const fs = require('fs');
const path = require('path');
const https = require('https');
const jwt = require('jsonwebtoken');
const curaduria = require('./curaduria');

function envDelArchivo(f) {
  if (!fs.existsSync(f)) return {};
  // split tolerante a CRLF: el .env del theme viene con \r y `.` no lo matchea.
  return Object.fromEntries(fs.readFileSync(f, 'utf8').split(/\r?\n/)
    .map(l => l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/))
    .filter(Boolean)
    .map(m => [m[1], m[2].trim().replace(/^["']|["']$/g, '')]));
}

const env = {
  ...envDelArchivo(path.join(__dirname, '../../.env')),   // el .env del theme
  ...envDelArchivo(path.join(__dirname, '.env')),
  ...process.env
};
const KEY = env.GHOST_ADMIN_KEY || env.GHOST_ADMIN_API_KEY;
const GHOST_URL = env.GHOST_URL || 'https://421bn.ghost.io';
if (!KEY) { console.error('Falta GHOST_ADMIN_KEY / GHOST_ADMIN_API_KEY'); process.exit(1); }

function ghostRequest(method, p, body) {
  return new Promise((resolve, reject) => {
    const url = new URL(p, GHOST_URL);
    const [id, secret] = KEY.split(':');
    const token = jwt.sign({}, Buffer.from(secret, 'hex'),
      { keyid: id, algorithm: 'HS256', expiresIn: '5m', audience: '/admin/' });
    const headers = { Authorization: `Ghost ${token}` };
    let postData;
    if (body) {
      postData = JSON.stringify(body);
      headers['Content-Type'] = 'application/json';
      headers['Content-Length'] = Buffer.byteLength(postData);
    }
    const req = https.request({ hostname: url.hostname, path: url.pathname + url.search, method, headers }, res => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => res.statusCode >= 200 && res.statusCode < 300
        ? resolve(JSON.parse(data))
        : reject(new Error(`Ghost API ${res.statusCode}: ${data.slice(0, 300)}`)));
    });
    req.on('error', reject);
    if (postData) req.write(postData);
    req.end();
  });
}

(async () => {
  const dry = process.argv.includes('--dry');
  const r = await curaduria.sweep({ ghostRequest, dry });

  const porIdioma = {};
  for (const c of r.cambios) {
    porIdioma[c.lang] = porIdioma[c.lang] || { posts: 0, add: 0, del: 0 };
    porIdioma[c.lang].posts++;
    porIdioma[c.lang].add += c.add.length;
    porIdioma[c.lang].del += c.del.length;
  }
  console.log('\nPor idioma:');
  for (const [l, v] of Object.entries(porIdioma)) {
    console.log(`  ${l}  ${String(v.posts).padStart(3)} posts   +${v.add} tags  -${v.del} tags`);
  }
  const out = path.join(__dirname, 'curaduria-ultimo-sweep.json');
  fs.writeFileSync(out, JSON.stringify(r.cambios, null, 1));
  console.log(`\nDetalle: ${out}`);
})().catch(e => { console.error(e.message); process.exit(1); });
