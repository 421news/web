#!/usr/bin/env node
/**
 * update-social-proof.js
 * Actualiza la línea de social proof ("N wizards · N lectores/readers")
 * en suscribite.hbs y subscribe.hbs con datos vivos de Ghost.
 *
 * Cálculo de pagos: paid (Stripe) + comped con label `wizard` (MercadoPago).
 * El label `wizard` marca a TODOS los que pagan por MP — los comped de
 * equipo sin sub activa no lo tienen (convención del MP-Ghost webhook).
 *
 * Uso:
 *   node scripts/update-social-proof.js           # actualiza los .hbs
 *   node scripts/update-social-proof.js --deploy  # + bump version, commit y push
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execSync } = require('child_process');

const ROOT = path.join(__dirname, '..');

// --- Ghost Admin API key desde .env (gitignored) ---
function loadEnv() {
  const envPath = path.join(ROOT, '.env');
  if (!fs.existsSync(envPath)) return {};
  const out = {};
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const m = line.match(/^([A-Z_]+)=(.*?)\r?$/);
    if (m) out[m[1]] = m[2].trim();
  }
  return out;
}
const env = loadEnv();
const ADMIN_KEY = process.env.GHOST_ADMIN_API_KEY || env.GHOST_ADMIN_API_KEY;
if (!ADMIN_KEY) {
  console.error('Falta GHOST_ADMIN_API_KEY (en .env o como env var)');
  process.exit(1);
}

function ghostToken() {
  const [id, secret] = ADMIN_KEY.split(':');
  const now = Math.floor(Date.now() / 1000);
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT', kid: id })).toString('base64url');
  const payload = Buffer.from(JSON.stringify({ iat: now, exp: now + 300, aud: '/admin/' })).toString('base64url');
  const sig = crypto.createHmac('sha256', Buffer.from(secret, 'hex')).update(header + '.' + payload).digest('base64url');
  return header + '.' + payload + '.' + sig;
}

async function countMembers(token, filter) {
  const url = new URL('https://421bn.ghost.io/ghost/api/admin/members/');
  url.searchParams.set('limit', '1');
  if (filter) url.searchParams.set('filter', filter);
  const res = await fetch(url, { headers: { Authorization: 'Ghost ' + token } });
  if (!res.ok) throw new Error(`Ghost API ${res.status}: ${await res.text()}`);
  const data = await res.json();
  return data.meta.pagination.total;
}

function replaceProof(file, regex, replacement) {
  const p = path.join(ROOT, file);
  const src = fs.readFileSync(p, 'utf8');
  if (!regex.test(src)) {
    console.warn(`⚠ ${file}: no encontré la línea de social proof (patrón ${regex})`);
    return false;
  }
  const before = src.match(regex)[0];
  const updated = src.replace(regex, replacement);
  if (before === replacement) {
    console.log(`= ${file}: ya estaba al día ("${replacement}")`);
    return false;
  }
  fs.writeFileSync(p, updated);
  console.log(`✓ ${file}: "${before}" → "${replacement}"`);
  return true;
}

(async () => {
  const token = ghostToken();
  const [total, paid, compedWizard] = await Promise.all([
    countMembers(token),
    countMembers(token, 'status:paid'),
    countMembers(token, 'status:comped+label:wizard'),
  ]);
  const paying = paid + compedWizard;
  console.log(`Ghost: ${total} members · ${paid} Stripe · ${compedWizard} MP wizard → ${paying} pagos`);

  const esTotal = total.toLocaleString('es-AR'); // 5.379
  const enTotal = total.toLocaleString('en-US'); // 5,379

  const changedEs = replaceProof(
    'suscribite.hbs',
    /[\d.,]+ wizards · [\d.,]+ lectores/,
    `${paying} wizards · ${esTotal} lectores`
  );
  const changedEn = replaceProof(
    'subscribe.hbs',
    /[\d.,]+ wizards · [\d.,]+ readers/,
    `${paying} wizards · ${enTotal} readers`
  );

  if (!changedEs && !changedEn) return;

  if (process.argv.includes('--deploy')) {
    const pkgPath = path.join(ROOT, 'package.json');
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
    const v = pkg.version.split('.');
    v[2] = String(Number(v[2]) + 1);
    pkg.version = v.join('.');
    fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n');
    console.log(`Version → ${pkg.version}`);
    execSync(
      `git add suscribite.hbs subscribe.hbs package.json && ` +
      `git commit -m "Update social proof: ${paying} wizards, ${total} lectores" && git push origin main`,
      { cwd: ROOT, stdio: 'inherit' }
    );
  } else {
    console.log('(sin --deploy: archivos actualizados, falta commit/push)');
  }
})().catch((e) => { console.error(e); process.exit(1); });
