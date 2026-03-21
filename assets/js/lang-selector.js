(function() {
  var LANGS = ['es','en','pt','fr','zh','ja','ko','tr'];
  var HOME_MAP = {};
  LANGS.forEach(function(l) { HOME_MAP[l] = '/' + l + '/'; });

  // Page-level URL mappings for non-post pages
  var PAGE_MAP = {
    '/es/': { en:'/en/', pt:'/pt/', fr:'/fr/', zh:'/zh/', ja:'/ja/', ko:'/ko/', tr:'/tr/' },
    '/en/': { es:'/es/', pt:'/pt/', fr:'/fr/', zh:'/zh/', ja:'/ja/', ko:'/ko/', tr:'/tr/' },
    '/es/suscribite/': { en:'/en/subscribe/', pt:'/pt/subscribe/', fr:'/fr/subscribe/', zh:'/zh/subscribe/', ja:'/ja/subscribe/', ko:'/ko/subscribe/', tr:'/tr/subscribe/' },
    '/en/subscribe/': { es:'/es/suscribite/', pt:'/pt/subscribe/', fr:'/fr/subscribe/', zh:'/zh/subscribe/', ja:'/ja/subscribe/', ko:'/ko/subscribe/', tr:'/tr/subscribe/' }
  };

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
    var hasHreflang = Object.keys(hreflangMap).length > 1;
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
          // Non-post page: map known pages or go to home
          var pageEntry = PAGE_MAP[path];
          if (pageEntry && pageEntry[lang]) {
            opt.href = pageEntry[lang];
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
