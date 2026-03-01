#!/usr/bin/env node
// Usage: node scripts/add-revista.js
// Interactive script to add a new issue to revista.json and deploy the theme.

const fs = require('fs');
const path = require('path');
const readline = require('readline');
const jwt = require('jsonwebtoken');
const FormData = require('form-data');
const https = require('https');
const { execSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const JSON_PATH = path.join(ROOT, 'assets/data/revista.json');
const PKG_PATH = path.join(ROOT, 'package.json');
const ZIP_PATH = '/tmp/421-theme.zip';
const DESKTOP_ZIP = path.join(require('os').homedir(), 'Escritorio/421-theme.zip');

const [id, secret] = '680be497f896280001455172:50f2d88ff42197eb96adf838b5c4b4baccc3ff6ff2e7772390b16ca4bcc6d967'.split(':');

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
function ask(q) { return new Promise(r => rl.question(q, r)); }

(async function () {
  const issues = JSON.parse(fs.readFileSync(JSON_PATH, 'utf8'));
  const lastNum = issues[0].numero;
  const nextNum = lastNum + 1;

  console.log('\n--- Agregar Revista 421 #' + nextNum + ' ---\n');

  const titulo = await ask('Título (ej: Especial Manga/Animé): ');
  const fecha = await ask('Fecha (ej: Marzo 2026): ');
  const cover = await ask('URL de la tapa: ');
  const pdf = await ask('URL del PDF: ');
  const size = await ask('Tamaño (ej: 4 MB): ');

  const creditos = [];
  console.log('\nCréditos (dejá vacío el rol para terminar):');
  while (true) {
    const rol = await ask('  Rol (ej: Portada, Diseño, Ilustraciones): ');
    if (!rol.trim()) break;
    const nombre = await ask('  Nombre: ');
    const url = await ask('  URL (Instagram/web): ');
    creditos.push({ rol: rol.trim(), nombre: nombre.trim(), url: url.trim() });
  }

  const newIssue = {
    numero: nextNum,
    titulo: titulo.trim(),
    fecha: fecha.trim(),
    cover: cover.trim(),
    pdf: pdf.trim(),
    size: size.trim(),
    creditos: creditos
  };

  console.log('\n' + JSON.stringify(newIssue, null, 2));
  const confirm = await ask('\n¿Agregar y deployar? (s/n): ');
  if (confirm.trim().toLowerCase() !== 's') {
    console.log('Cancelado.');
    rl.close();
    return;
  }

  // 1. Add to JSON
  issues.unshift(newIssue);
  fs.writeFileSync(JSON_PATH, JSON.stringify(issues, null, 2) + '\n');
  console.log('\nrevista.json actualizado (#' + nextNum + ' agregado).');

  // 2. Bump patch version
  const pkg = JSON.parse(fs.readFileSync(PKG_PATH, 'utf8'));
  const parts = pkg.version.split('.');
  parts[2] = String(Number(parts[2]) + 1);
  pkg.version = parts.join('.');
  fs.writeFileSync(PKG_PATH, JSON.stringify(pkg, null, 2) + '\n');
  console.log('Version bumped a ' + pkg.version);

  // 3. Zip
  execSync(
    'zip -r ' + ZIP_PATH + ' . -x ".git/*" "node_modules/*" ".github/*" "scripts/*" "testeo/*" "mockup-*.html" "backups/*" "*.zip"',
    { cwd: ROOT, stdio: 'ignore' }
  );
  fs.copyFileSync(ZIP_PATH, DESKTOP_ZIP);
  console.log('Zip creado.');

  // 4. Upload & activate
  const token = jwt.sign({}, Buffer.from(secret, 'hex'), {
    keyid: id, algorithm: 'HS256', expiresIn: '5m', audience: '/admin/'
  });

  await new Promise(function (resolve, reject) {
    const form = new FormData();
    form.append('file', fs.createReadStream(ZIP_PATH));
    const req = https.request({
      hostname: '421bn.ghost.io',
      path: '/ghost/api/admin/themes/upload/',
      method: 'POST',
      headers: { ...form.getHeaders(), 'Authorization': 'Ghost ' + token }
    }, function (res) {
      var data = ''; res.on('data', function (c) { data += c; });
      res.on('end', function () {
        if (res.statusCode === 200) {
          console.log('Upload OK');
          resolve();
        } else {
          console.error('Upload FAIL:', res.statusCode);
          reject(new Error(res.statusCode));
        }
      });
    });
    req.on('error', reject);
    form.pipe(req);
  });

  await new Promise(function (resolve, reject) {
    var req = https.request({
      hostname: '421bn.ghost.io',
      path: '/ghost/api/admin/themes/421-theme/activate/',
      method: 'PUT',
      headers: { 'Authorization': 'Ghost ' + token, 'Content-Length': 0 }
    }, function (res) {
      var d = ''; res.on('data', function (c) { d += c; });
      res.on('end', function () {
        console.log('Activate:', res.statusCode === 200 ? 'OK' : 'FAIL ' + res.statusCode);
        resolve();
      });
    });
    req.on('error', reject);
    req.end();
  });

  console.log('\nRevista #' + nextNum + ' publicada.');
  rl.close();
})();
