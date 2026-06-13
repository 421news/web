/**
 * focal-points.js
 * --------------------------------------------------------------------------
 * Aplica `object-position` a las feature images con object-fit:cover según el
 * "focal point" precalculado (assets/data/feature-focal.json, generado por
 * scripts/generate-focal-points.js con Claude vision).
 *
 * NO cambia ningún aspect ratio. Solo decide QUÉ parte de la foto sobrevive
 * al recorte, para que el sujeto importante no quede cortado. Si una imagen
 * no está en el JSON, queda en centro (comportamiento actual) → sin regresión.
 *
 * Cubre: hero full-bleed (home + headers de posts normales), home mobile,
 * cards de la grilla (render client-side) y header split del destacado.
 * --------------------------------------------------------------------------
 */
(function () {
  // Webhook primero (incluye posts nuevos publicados desde el último backfill);
  // si falla o tarda, cae al asset commiteado del theme. Sin webhook → asset.
  var WEBHOOK = 'https://webhook-hreflang.onrender.com/api/feature-focal.json';
  var ASSET = window.__FOCAL_SRC || '/assets/data/feature-focal.json';
  var SELECTOR = '.home-featured-bg, .pc__img, .featured-post-image img, .post-mhero-image img';
  // En los heros full-bleed la nav fija (sólida) tapa los ~96px de arriba. Para
  // que la barra cubra fondo y no el sujeto, bajamos el encuadre del hero: se le
  // resta a la Y del focal (menos Y = sujeto más abajo, con aire bajo la nav).
  // No afecta cards (la nav no las tapa). Tuneá HERO_Y_BIAS si hace falta.
  var HERO_SEL = '.home-featured-bg, .featured-post-image img';
  var HERO_Y_BIAS = 18;
  var map = null;

  // Misma normalización que el script de backfill: queda "2026/06/foo.webp"
  function focalKey(url) {
    if (!url) return null;
    var i = url.indexOf('/content/images/');
    if (i < 0) return null;
    var p = url.slice(i + 16).replace(/^size\/[^/]+\//, '');
    return p.split('?')[0];
  }

  function apply(img) {
    if (img.__focalDone || !map) return;
    var key = focalKey(img.getAttribute('src') || img.currentSrc || '');
    if (!key) return;
    var pos = map[key];
    if (pos) {
      // En heros: bajar el sujeto para que la nav no lo tape (resta a la Y)
      if (img.matches && img.matches(HERO_SEL)) {
        var m = pos.match(/^(\d+)%\s+(\d+)%$/);
        if (m) pos = m[1] + '% ' + Math.max(5, parseInt(m[2], 10) - HERO_Y_BIAS) + '%';
      }
      img.style.objectPosition = pos;
    }
    img.__focalDone = true; // marcar aunque no haya entry, para no reprocesar
  }

  function scan(root) {
    var nodes = (root || document).querySelectorAll(SELECTOR);
    for (var i = 0; i < nodes.length; i++) apply(nodes[i]);
  }

  // Las cards se renderizan client-side (render-card.js) → observar el DOM.
  var mo = new MutationObserver(function (muts) {
    if (!map) return;
    for (var i = 0; i < muts.length; i++) {
      var added = muts[i].addedNodes;
      for (var j = 0; j < added.length; j++) {
        var n = added[j];
        if (n.nodeType !== 1) continue;
        if (n.matches && n.matches(SELECTOR)) apply(n);
        if (n.querySelectorAll) scan(n);
      }
    }
  });

  function startObserving() {
    mo.observe(document.body, { childList: true, subtree: true });
  }
  if (document.body) startObserving();
  else document.addEventListener('DOMContentLoaded', startObserving);

  function load(url) { return fetch(url).then(function (r) {
    if (!r.ok) throw new Error('HTTP ' + r.status); return r.json();
  }); }

  // webhook (3s timeout vía race) → fallback al asset → fallback a centro
  var timeout = new Promise(function (_, rej) { setTimeout(rej, 3000); });
  Promise.race([load(WEBHOOK), timeout])
    .catch(function () { return load(ASSET); })
    .then(function (j) { map = j; scan(document); })
    .catch(function () { /* sin JSON → todo en centro, sin regresión */ });
})();
