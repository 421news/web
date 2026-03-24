// Lightweight language-filtered search (replaces Sodo Search)
(function () {
  var API_KEY = '420da6f85b5cc903b347de9e33';
  var langMatch = location.pathname.match(/^\/([a-z]{2})\//);
  var lang = langMatch ? langMatch[1] : 'es';
  var tagMap = { es: 'hash-es', en: 'hash-en', zh: 'hash-zh', ja: 'hash-ja', ko: 'hash-ko', tr: 'hash-tr', pt: 'hash-pt', fr: 'hash-fr' };
  var langTag = tagMap[lang] || 'hash-es';

  var i18n = {
    es: { placeholder: 'Buscar...', close: 'Cerrar', noResults: 'No se encontraron resultados' },
    en: { placeholder: 'Search...', close: 'Close', noResults: 'No results found' },
    pt: { placeholder: 'Pesquisar...', close: 'Fechar', noResults: 'Nenhum resultado encontrado' },
    fr: { placeholder: 'Rechercher...', close: 'Fermer', noResults: 'Aucun résultat' },
    zh: { placeholder: '\u641c\u7d22...', close: '\u5173\u95ed', noResults: '\u672a\u627e\u5230\u7ed3\u679c' },
    ja: { placeholder: '\u691c\u7d22...', close: '\u9589\u3058\u308b', noResults: '\u7d50\u679c\u304c\u898b\u3064\u304b\u308a\u307e\u305b\u3093' },
    ko: { placeholder: '\uac80\uc0c9...', close: '\ub2eb\uae30', noResults: '\uacb0\uacfc\uac00 \uc5c6\uc2b5\ub2c8\ub2e4' },
    tr: { placeholder: 'Ara...', close: 'Kapat', noResults: 'Sonu\u00e7 bulunamad\u0131' }
  };
  var t = i18n[lang] || i18n.es;

  var postsCache = null;
  var modal = null;
  var input = null;
  var results = null;

  function createModal() {
    modal = document.createElement('div');
    modal.id = 'search-modal';
    modal.innerHTML =
      '<div class="search-overlay"></div>' +
      '<div class="search-box">' +
        '<input type="text" class="search-input" placeholder="' + t.placeholder + '" />' +
        '<div class="search-results"></div>' +
        '<div class="search-close">' + t.close + ' \u00b7 ESC</div>' +
      '</div>';
    document.body.appendChild(modal);

    input = modal.querySelector('.search-input');
    results = modal.querySelector('.search-results');

    modal.querySelector('.search-overlay').addEventListener('click', closeSearch);
    modal.querySelector('.search-close').addEventListener('click', closeSearch);
    input.addEventListener('input', debounce(doSearch, 150));

    var style = document.createElement('style');
    style.textContent =
      '#search-modal { display:none; position:fixed; inset:0; z-index:99999; }' +
      '#search-modal.open { display:block; }' +
      '.search-overlay { position:absolute; inset:0; background:rgba(0,0,0,0.7); backdrop-filter:blur(4px); }' +
      '.search-box { position:relative; max-width:620px; margin:10vh auto 0; background:var(--negro,#121212); border:1px solid rgba(255,255,255,0.15); border-radius:12px; overflow:hidden; }' +
      '.search-input { width:100%; padding:16px 20px; background:transparent; border:none; border-bottom:1px solid rgba(255,255,255,0.1); color:var(--crema,#eae6e1); font-size:18px; font-family:inherit; outline:none; }' +
      '.search-input::placeholder { color:rgba(234,230,225,0.4); }' +
      '.search-results { max-height:60vh; overflow-y:auto; padding:0; }' +
      '.search-results:empty::after { content:""; display:none; }' +
      '.search-result { display:flex; gap:14px; padding:14px 20px; text-decoration:none; color:var(--crema,#eae6e1); border-bottom:1px solid rgba(255,255,255,0.05); transition:background 0.15s; align-items:center; }' +
      '.search-result:hover { background:rgba(255,255,255,0.06); }' +
      '.search-result-img { width:64px; height:44px; border-radius:6px; object-fit:cover; flex-shrink:0; }' +
      '.search-result-text { flex:1; min-width:0; }' +
      '.search-result-title { font-weight:700; font-size:15px; margin:0 0 2px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }' +
      '.search-result-excerpt { font-size:13px; color:rgba(234,230,225,0.5); margin:0; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }' +
      '.search-no-results { padding:20px; text-align:center; color:rgba(234,230,225,0.4); font-style:italic; }' +
      '.search-close { padding:10px 20px; text-align:center; font-size:12px; color:rgba(234,230,225,0.3); cursor:pointer; border-top:1px solid rgba(255,255,255,0.05); }' +
      '.search-close:hover { color:var(--crema,#eae6e1); }' +
      '@media(max-width:768px) { .search-box { margin:5vh 12px 0; } .search-result-img { width:48px; height:33px; } }';
    document.head.appendChild(style);
  }

  function debounce(fn, ms) {
    var t; return function () { clearTimeout(t); t = setTimeout(fn, ms); };
  }

  function fetchPosts() {
    if (postsCache) return Promise.resolve(postsCache);
    var url = '/ghost/api/content/posts/?key=' + API_KEY +
      '&filter=tag:' + langTag +
      '&fields=title,url,excerpt,feature_image' +
      '&limit=all&order=published_at desc';
    return fetch(url).then(function (r) { return r.json(); }).then(function (data) {
      postsCache = (data.posts || []).map(function (p) {
        return {
          title: p.title,
          url: p.url,
          excerpt: (p.excerpt || '').substring(0, 150),
          img: p.feature_image,
          _lower: (p.title + ' ' + (p.excerpt || '')).toLowerCase()
        };
      });
      return postsCache;
    });
  }

  function doSearch() {
    var q = input.value.trim().toLowerCase();
    if (q.length < 2) { results.innerHTML = ''; return; }

    fetchPosts().then(function (posts) {
      var terms = q.split(/\s+/);
      var matched = posts.filter(function (p) {
        return terms.every(function (t) { return p._lower.indexOf(t) !== -1; });
      }).slice(0, 12);

      if (matched.length === 0) {
        results.innerHTML = '<div class="search-no-results">' + t.noResults + '</div>';
        return;
      }

      results.innerHTML = matched.map(function (p) {
        var imgHtml = p.img
          ? '<img src="' + p.img + '" class="search-result-img" loading="lazy" alt="" />'
          : '';
        return '<a href="' + p.url + '" class="search-result">' +
          imgHtml +
          '<div class="search-result-text">' +
          '<p class="search-result-title">' + escHtml(p.title) + '</p>' +
          '<p class="search-result-excerpt">' + escHtml(p.excerpt) + '</p>' +
          '</div></a>';
      }).join('');
    });
  }

  function escHtml(s) {
    if (!s) return '';
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function openSearch(e) {
    e.preventDefault();
    e.stopPropagation();
    if (!modal) createModal();
    modal.classList.add('open');
    input.value = '';
    results.innerHTML = '';
    input.focus();
    fetchPosts(); // pre-fetch
  }

  function closeSearch() {
    if (modal) modal.classList.remove('open');
  }

  // Intercept Ghost search buttons
  document.addEventListener('click', function (e) {
    var btn = e.target.closest('[data-ghost-search]');
    if (btn) openSearch(e);
  }, true); // capture phase to beat Ghost's listener

  // ESC to close
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && modal && modal.classList.contains('open')) closeSearch();
  });

  // Ctrl/Cmd + K shortcut
  document.addEventListener('keydown', function (e) {
    if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
      e.preventDefault();
      openSearch(e);
    }
  });
})();
