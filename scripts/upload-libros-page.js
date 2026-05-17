/**
 * Sube el mockup de "Libros de Juan Ruocco" como una Ghost Page (draft).
 * Toma el HTML del mockup en testeo/, extrae <style> + JSON-LD + body, y los
 * empaqueta en una sola HTML card de Ghost.
 *
 * Run: node scripts/upload-libros-page.js
 */

const fs = require('fs');
const path = require('path');
const jwt = require('jsonwebtoken');

const MOCKUP = path.join(__dirname, '..', 'testeo', 'mockup-juan-ruocco-libros-v4.html');
const ADMIN_KEY = '680be497f896280001455172:50f2d88ff42197eb96adf838b5c4b4baccc3ff6ff2e7772390b16ca4bcc6d967';
const GHOST_HOST = 'https://421bn.ghost.io';

const [keyId, keySecret] = ADMIN_KEY.split(':');
const token = jwt.sign({}, Buffer.from(keySecret, 'hex'), {
  keyid: keyId,
  algorithm: 'HS256',
  expiresIn: '5m',
  audience: '/admin/'
});

const mockup = fs.readFileSync(MOCKUP, 'utf-8');

const style = (mockup.match(/<style>([\s\S]*?)<\/style>/) || ['', ''])[1];
const jsonLd = [...mockup.matchAll(/<script type="application\/ld\+json">[\s\S]*?<\/script>/g)]
  .map(m => m[0]).join('\n');

let body = (mockup.match(/<body>([\s\S]*?)<\/body>/) || ['', ''])[1].trim();
body = body.replace(/^<main>/, '').replace(/<\/main>\s*$/, '').trim();

const fullHtml = `<style>${style}</style>\n${jsonLd}\n${body}`;

const ogImage = 'https://storage.ghost.io/c/2b/7f/2b7f69fc-a243-4d2f-ae8e-db8312c6653a/content/images/2025/10/juan_ruocco-1.jpg';

const page = {
  title: 'Libros de Juan Ruocco',
  slug: 'juan-ruocco-libros',
  status: 'draft',
  html: fullHtml,
  meta_title: 'Libros de Juan Ruocco | 421',
  meta_description: 'Los cuatro libros de Juan Ruocco en un solo lugar: ¿La democracia en peligro?, 3220, Autopista al Espacio y El Coloso Justicialista. Descarga gratis en EPUB y links de compra.',
  og_title: 'Libros de Juan Ruocco | 421',
  og_description: 'Los cuatro libros del director de 421. Descarga gratis en EPUB o compra en librerías.',
  og_image: ogImage,
  twitter_title: 'Libros de Juan Ruocco | 421',
  twitter_description: 'Los cuatro libros del director de 421. Descarga gratis en EPUB o compra en librerías.',
  twitter_image: ogImage,
  feature_image: ogImage
};

(async () => {
  const url = `${GHOST_HOST}/ghost/api/admin/pages/?source=html`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': 'Ghost ' + token,
      'Content-Type': 'application/json',
      'Accept-Version': 'v5.0'
    },
    body: JSON.stringify({ pages: [page] })
  });
  const data = await res.json();
  if (data.errors) {
    console.error('Ghost API errors:');
    console.error(JSON.stringify(data.errors, null, 2));
    process.exit(1);
  }
  const p = data.pages[0];
  console.log('OK — page created');
  console.log('  id     :', p.id);
  console.log('  slug   :', p.slug);
  console.log('  status :', p.status);
  console.log('  url    :', p.url);
  console.log('  admin  :', `${GHOST_HOST}/ghost/#/editor/page/${p.id}`);
})();
