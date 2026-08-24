(function() {
  var LANGS = ['es','en','pt','fr','zh','ja','ko','tr'];
  var INTL = ['pt','fr','zh','ja','ko','tr'];

  // Las secciones del sitio, con el slug que usa cada una en cada idioma.
  // Los 6 idiomas intl comparten slug siempre; ES y EN son los que difieren.
  // `null` = la seccion no existe en ese idioma.
  //
  // Esta tabla es la fuente unica del mapeo. Antes habia un PAGE_MAP escrito a
  // mano que solo cubria la home y suscribite: desde /es/rutas/ el selector de
  // idioma mandaba a /en/ en vez de /en/routes/, y lo mismo pasaba en canon,
  // que-es-421, los archivos y las 4 paginas de tag primarias.
  function seccion(es, en, intl) {
    var m = { es: es, en: en };
    INTL.forEach(function(l) { m[l] = intl; });
    return m;
  }
  var SECCIONES = [
    seccion('',              '',                ''),
    seccion('rutas',         'routes',          'rutas'),
    seccion('canon',         'canon',           'canon'),
    seccion('suscribite',    'subscribe',       'subscribe'),
    seccion('que-es-421',    'what-is-421',     'what-is-421'),
    seccion('ultimos-posts', 'last-posts',      null),
    seccion('mi-suscripcion','my-subscription', null),
    seccion('revista-421',   'magazine',        null),
    seccion('pitcheale-a-421', 'pitch-us',      null),
    seccion('random-podcast-juan-ruocco', 'podcast', null),
    seccion('tag/cultura',   'tag/culture',     'tag/culture'),
    seccion('tag/juegos',    'tag/games',       'tag/games'),
    seccion('tag/vida-real', 'tag/real-life',   'tag/real-life'),
    seccion('tag/tecnologia','tag/tech',        'tag/tech')
  ];

  // path -> { lang: url }. Se deriva de la tabla, no se escribe a mano.
  var urlDe = function(lang, slug) { return '/' + lang + '/' + (slug ? slug + '/' : ''); };
  var PAGE_MAP = {};
  SECCIONES.forEach(function(sec) {
    LANGS.forEach(function(desde) {
      if (sec[desde] == null) return;
      var destinos = {};
      LANGS.forEach(function(hacia) {
        if (hacia === desde || sec[hacia] == null) return;
        destinos[hacia] = urlDe(hacia, sec[hacia]);
      });
      PAGE_MAP[urlDe(desde, sec[desde])] = destinos;
    });
  });

  function detectCurrentLang() {
    var path = window.location.pathname;
    for (var i = 0; i < LANGS.length; i++) {
      if (path.startsWith('/' + LANGS[i] + '/')) return LANGS[i];
    }
    return 'es';
  }

  function getHreflangMap() {
    var map = {};
    var links = document.querySelectorAll('link[rel="alternate"][hreflang]');
    for (var i = 0; i < links.length; i++) {
      var lang = links[i].getAttribute('hreflang');
      var href = links[i].getAttribute('href');
      if (lang && href && lang !== 'x-default') {
        map[lang] = href;
      }
    }
    return map;
  }

  document.addEventListener('DOMContentLoaded', function() {
    var selectors = document.querySelectorAll('.lang-selector');
    if (!selectors.length) return;

    var currentLang = detectCurrentLang();
    var hreflangMap = getHreflangMap();
    // >= 1: alcanza con UN link para saber que estamos en un post con traduccion.
    // Muchos posts solo traen el link al otro idioma, sin el self-referencial;
    // con `> 1` caian al branch de pagina comun y el selector mandaba a la home.
    var hasHreflang = Object.keys(hreflangMap).length >= 1;
    var path = window.location.pathname.replace(/\/?$/, '/');

    selectors.forEach(function(selector) {
      var toggle = selector.querySelector('.lang-selector-toggle');
      var menu = selector.querySelector('.lang-selector-menu');
      var options = selector.querySelectorAll('.lang-option');

      // Set URLs and visibility
      options.forEach(function(opt) {
        var lang = opt.getAttribute('data-lang');

        if (lang === currentLang) {
          opt.classList.add('is-current');
        }

        if (hasHreflang && hreflangMap[lang]) {
          // Post page: use hreflang URLs, show only available
          opt.href = hreflangMap[lang];
          opt.classList.remove('is-unavailable');
        } else if (hasHreflang && !hreflangMap[lang] && lang !== currentLang) {
          // Post page: this language doesn't exist
          opt.classList.add('is-unavailable');
          opt.href = '/' + lang + '/';
        } else if (!hasHreflang) {
          // Pagina de seccion: se traduce por la tabla.
          var pageEntry = PAGE_MAP[path];
          if (pageEntry && pageEntry[lang]) {
            opt.href = pageEntry[lang];
            opt.classList.remove('is-unavailable');
          } else if (pageEntry && lang !== currentLang) {
            // La seccion existe, pero no en este idioma (ej. el archivo, que solo
            // esta en ES y EN): se marca igual que un post sin traduccion.
            opt.classList.add('is-unavailable');
            opt.href = '/' + lang + '/';
          } else {
            opt.href = '/' + lang + '/';
          }
        }
      });

      // Toggle dropdown on click only
      toggle.addEventListener('click', function(e) {
        e.preventDefault();
        e.stopPropagation();
        var wasOpen = selector.classList.contains('is-open');
        // Close all other selectors first
        selectors.forEach(function(s) { s.classList.remove('is-open'); });
        if (!wasOpen) selector.classList.add('is-open');
      });
    });

    // Close on outside click
    document.addEventListener('click', function() {
      selectors.forEach(function(s) { s.classList.remove('is-open'); });
    });

    document.addEventListener('keydown', function(e) {
      if (e.key === 'Escape') selectors.forEach(function(s) { s.classList.remove('is-open'); });
    });
  });
})();
