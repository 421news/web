#!/usr/bin/env node
/**
 * 421.news Theme Deploy Script
 *
 * Zips the theme, uploads to Ghost, activates it, and runs Lighthouse.
 *
 * Usage:
 *   node scripts/deploy.js                — Deploy + quick Lighthouse (home-es only)
 *   node scripts/deploy.js --full         — Deploy + full Lighthouse (4 pages)
 *   node scripts/deploy.js --no-lighthouse — Deploy only, skip audit
 */

const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const https = require('https');

const WEB_DIR = path.join(__dirname, '..');
const CLAUDE_DIR = path.join(WEB_DIR, '..');
const LIGHTHOUSE_SCRIPT = path.join(CLAUDE_DIR, 'seo', 'lighthouse', 'run-lighthouse.js');
const DESKTOP_DIR = path.join(process.env.HOME, 'Escritorio');

// Load .env
const envPath = path.join(WEB_DIR, '.env');
if (fs.existsSync(envPath)) {
  fs.readFileSync(envPath, 'utf8').split('\n').forEach(line => {
    const [key, ...val] = line.split('=');
    if (key && val.length) process.env[key.trim()] = val.join('=').trim();
  });
}

const ADMIN_KEY = process.env.GHOST_ADMIN_API_KEY || '680be497f896280001455172:50f2d88ff42197eb96adf838b5c4b4baccc3ff6ff2e7772390b16ca4bcc6d967';
const HOST = '421bn.ghost.io';

const jwt = require(path.join(WEB_DIR, 'node_modules', 'jsonwebtoken'));
const FormData = require(path.join(WEB_DIR, 'node_modules', 'form-data'));

function getToken() {
  const [id, secret] = ADMIN_KEY.split(':');
  return jwt.sign({}, Buffer.from(secret, 'hex'), {
    keyid: id, algorithm: 'HS256', expiresIn: '5m', audience: '/admin/'
  });
}

function apiRequest(method, apiPath, form) {
  return new Promise((resolve, reject) => {
    const headers = { 'Authorization': 'Ghost ' + getToken() };
    if (form) Object.assign(headers, form.getHeaders());
    else headers['Content-Length'] = 0;

    const req = https.request({
      hostname: HOST, path: apiPath, method, headers
    }, res => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        if (res.statusCode >= 400) reject(new Error(`${res.statusCode}: ${data.slice(0, 300)}`));
        else resolve({ status: res.statusCode, data });
      });
    });
    req.on('error', reject);
    if (form) form.pipe(req);
    else req.end();
  });
}

async function main() {
  const args = process.argv.slice(2);
  const skipLighthouse = args.includes('--no-lighthouse');
  const fullLighthouse = args.includes('--full');

  // 1. Read current version
  const pkgPath = path.join(WEB_DIR, 'package.json');
  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
  console.log(`\n  Theme: ${pkg.name} v${pkg.version}`);

  // 2. Zip
  const zipPath = '/tmp/421-theme.zip';
  const excludes = [
    '.git/*', 'node_modules/*', '.github/*', 'scripts/*',
    'testeo/*', 'mockup-*.html', 'backups/*', '*.zip'
  ].map(e => `-x "${e}"`).join(' ');

  console.log('  Zipping...');
  execSync(`cd "${WEB_DIR}" && zip -r "${zipPath}" . ${excludes}`, { stdio: 'pipe' });

  // Copy to desktop
  if (fs.existsSync(DESKTOP_DIR)) {
    fs.copyFileSync(zipPath, path.join(DESKTOP_DIR, '421-theme.zip'));
  }

  const zipSize = (fs.statSync(zipPath).size / 1024).toFixed(0);
  console.log(`  Zip ready: ${zipSize} KB`);

  // 3. Upload
  console.log('  Uploading...');
  const form = new FormData();
  form.append('file', fs.createReadStream(zipPath));
  const uploadResult = await apiRequest('POST', '/ghost/api/admin/themes/upload/', form);
  console.log(`  Upload: ${uploadResult.status}`);

  // 4. Activate
  console.log('  Activating...');
  const activateResult = await apiRequest('PUT', '/ghost/api/admin/themes/421-theme/activate/');
  console.log(`  Activate: ${activateResult.status}`);

  console.log(`\n  v${pkg.version} deployed!\n`);

  // 5. Lighthouse
  if (skipLighthouse) {
    console.log('  Lighthouse skipped (--no-lighthouse)\n');
    return;
  }

  if (!fs.existsSync(LIGHTHOUSE_SCRIPT)) {
    console.log('  Lighthouse script not found, skipping.\n');
    return;
  }

  // Wait for CDN to propagate
  console.log('  Waiting 10s for CDN...');
  await new Promise(r => setTimeout(r, 10000));

  const lhFlag = fullLighthouse ? '' : '--quick';
  console.log(`  Running Lighthouse${fullLighthouse ? ' (full)' : ' (quick)'}...\n`);

  try {
    execSync(`node "${LIGHTHOUSE_SCRIPT}" ${lhFlag}`, { stdio: 'inherit', timeout: 600000 });
  } catch (err) {
    console.error('  Lighthouse failed:', err.message.slice(0, 200));
  }
}

main().catch(err => {
  console.error('Deploy failed:', err.message);
  process.exit(1);
});
