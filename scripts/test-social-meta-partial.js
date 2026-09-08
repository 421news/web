#!/usr/bin/env node
'use strict';
/**
 * Test de render de partials/social-meta.hbs.
 *
 * Por que existe: al escribir el partial se intento no repetir los defaults,
 * usando `block "ogTitle"` sin cuerpo para la segunda invocacion (la de
 * twitter:*). Parecia obviamente correcto y estaba mal: el helper block guarda
 * lo que puso contentFor, pero NO guarda el default, asi que la invocacion sin
 * cuerpo devuelve vacio cuando la plantilla de idioma no piso el valor. Los
 * twitter:* de /es/ y de / habrian salido en blanco en produccion.
 *
 * Por eso los defaults van repetidos en el partial. Este test es lo que impide
 * que la proxima "limpieza" del duplicado vuelva a romperlo en silencio: es un
 * bug que no da error en ningun lado, solo metacards vacias.
 *
 * Uso:  node scripts/test-social-meta-partial.js
 * Sale con codigo 1 si algun escenario produce un valor vacio o descolgado.
 *
 * Necesita handlebars. NO esta declarado en package.json a proposito: agregarlo
 * hace que npm reescriba package-lock.json y de paso pode 61 paquetes del arbol
 * de Express que estaban ahi de antes. Si falta:  npm i --no-save handlebars
 *
 * No se sube con el theme: el deploy excluye scripts/.
 */
const fs = require('fs');
const path = require('path');
let hbs;
try {
  hbs = require('handlebars');
} catch (e) {
  console.error('Falta handlebars. Instalarlo sin tocar el lockfile:\n  npm i --no-save handlebars');
  process.exit(2);
}

const PARTIAL = path.join(__dirname, '..', 'partials', 'social-meta.hbs');

// Reimplementacion minima de los helpers block/contentFor de Ghost:
// contentFor guarda, block lee. Si block trae cuerpo y no hay nada guardado,
// el cuerpo es el default. Leer un bloque no lo consume: el mismo bloque se
// invoca dos veces (una para og:*, otra para twitter:*).
let store = {};
hbs.registerHelper('contentFor', function (name, opts) { store[name] = opts.fn(this); return ''; });
hbs.registerHelper('block', function (name, opts) {
  if (store[name] !== undefined) return new hbs.SafeString(store[name]);
  return new hbs.SafeString(opts && opts.fn ? opts.fn(this) : '');
});

const tpl = hbs.compile(fs.readFileSync(PARTIAL, 'utf8'));

const ESCENARIOS = [
  { nombre: 'home por defecto (/ y /es/ sin contentFor de texto)', blocks: {}, ctx: {} },
  {
    nombre: 'home intl (contentFor como en ja.hbs)',
    blocks: {
      ogTitle: '421 | 認知的食事のための上質な情報',
      ogDescription: 'アルゼンチンのデジタルメディア。',
      ogLocale: 'ja_JP',
    },
    ctx: {},
  },
  {
    nombre: 'home /es/ (pisa solo la imagen, como index.hbs)',
    blocks: {
      ogImage: 'https://www.421.news/content/images/2026/05/revista-10-trimmed.jpg',
      ogImageWidth: '2000',
      ogImageHeight: '1125',
    },
    ctx: {},
  },
  {
    nombre: 'standalone por parametro (quilmes-rock, media-kit, tarifario)',
    blocks: {},
    ctx: {
      standalone: true,
      title: '421 · Road to Quilmes Rock 2027',
      description: 'Plan de 421 para llegar al Quilmes Rock 2027.',
      url: 'https://www.421.news/es/quilmes-rock/',
    },
  },
];

// Todo lo que tiene que salir con valor en cualquier escenario.
const OBLIGATORIAS = ['og:title', 'og:description', 'og:locale', 'og:image', 'og:image:width', 'og:image:height', 'twitter:card', 'twitter:title', 'twitter:description', 'twitter:image'];

function metas(html) {
  const out = {};
  const re = /<meta\s+(?:property|name)="([^"]+)"\s+content="([^"]*)"/g;
  let m;
  while ((m = re.exec(html))) out[m[1]] = m[2];
  return out;
}

let fallos = 0;
for (const e of ESCENARIOS) {
  store = { ...e.blocks };
  const out = metas(tpl(e.ctx));
  const errs = [];
  for (const k of OBLIGATORIAS) {
    if (out[k] === undefined) errs.push(`falta ${k}`);
    else if (out[k].trim() === '') errs.push(`${k} VACIA`);
  }
  // og y twitter tienen que decir lo mismo: cuando se desincronizaron, X y
  // WhatsApp terminaron mostrando imagenes distintas.
  for (const [a, b] of [['og:title', 'twitter:title'], ['og:description', 'twitter:description'], ['og:image', 'twitter:image']]) {
    if (out[a] !== out[b]) errs.push(`${a} != ${b} ("${out[a]}" vs "${out[b]}")`);
  }
  if (out['twitter:card'] !== 'summary_large_image') errs.push(`twitter:card = "${out['twitter:card']}"`);
  if (e.ctx.standalone && !out['og:url']) errs.push('standalone sin og:url');

  console.log(`${errs.length ? '❌' : '✅'} ${e.nombre}`);
  for (const x of errs) console.log(`      ${x}`);
  fallos += errs.length;
}
console.log(fallos ? `\n${fallos} fallos` : '\nSin fallos');
process.exit(fallos ? 1 : 0);
